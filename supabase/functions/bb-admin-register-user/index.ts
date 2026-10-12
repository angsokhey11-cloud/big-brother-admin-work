import { withSupabase } from "npm:@supabase/server@1.5.3";

/**
 * BIG BROTHER: Admin-provisioned user registration.
 * The running Supabase environment (Live or Local Brain) is authoritative.
 * No client-supplied URL, service key, role, or active permission is accepted.
 *
 * Deploy the exact same file to Live and Local Supabase Edge Functions.
 * Requires bb_has_module_access and existing User & Permission Manager schema.
 */
type RegisterInput = { email?: unknown; password?: unknown };

function response(message: string, status: number): Response {
  return Response.json({ success: false, message }, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return response("POST required", 405);

    // Enforce the existing explicit approval permission on the server.
    // Being an Admin by itself is intentionally NOT an override.
    const { data: allowed, error: permissionError } = await ctx.supabase.rpc(
      "bb_has_module_access",
      { p_module_key: "route.admin-user-permissions", p_action: "approve" },
    );
    if (permissionError || allowed !== true) {
      return response("User & Permission Manager approval access required", 403);
    }

    let payload: RegisterInput;
    try {
      payload = await req.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return response("Invalid registration request", 400);
      }
    } catch {
      return response("Invalid JSON body", 400);
    }

    const email = typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";
    const password = typeof payload.password === "string"
      ? payload.password
      : "";
    if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email) || email.length > 254) {
      return response("Valid email address is required", 400);
    }
    if (password.length < 12 || password.length > 128 ||
        !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return response("Password must be 12–128 characters and include a letter and number", 400);
    }

    // Legacy Auth-to-app_users trigger auto-approves active allowlisted emails.
    // Fail closed rather than creating a user with unexpected active privileges.
    const { data: allowlisted, error: allowlistError } = await ctx.supabaseAdmin
      .from("app_user_allowlist")
      .select("email")
      .eq("email", email)
      .limit(1);
    if (allowlistError) {
      return response("Could not verify legacy allowlist; registration was not attempted", 503);
    }
    if (allowlisted && allowlisted.length > 0) {
      return response("This email has a legacy allowlist entry. Review it before direct registration.", 409);
    }

    // Server-side admin API. The service credential never enters frontend code.
    // email_confirm avoids dependence on an outbound email service offline.
    const { data, error } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return response(error.message || "Registration failed", 400);
    if (!data.user?.id) return response("Auth did not return a user", 502);

    // This creates an Auth identity ONLY. No app_users approval, staff link,
    // location access or module grants. Existing Manager saves those separately.
    return Response.json({
      success: true,
      message: "Auth account created. Assign permissions before the employee signs in.",
      user: { userId: data.user.id, email: data.user.email || email },
      requiresApproval: true,
    });
  }),
};
