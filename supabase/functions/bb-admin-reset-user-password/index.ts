import { withSupabase } from "npm:@supabase/server@1.5.3";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reply = (status: number, message: string) =>
  Response.json({ success: false, message }, {
    status, headers: { "Cache-Control": "no-store" },
  });

/**
 * Admin-only direct password reset for existing accounts with non-deliverable
 * login emails. Deploy the SAME source to Live and Local Supabase.
 *
 * Requires:
 * - auth user with an active BIG BROTHER admin profile AND explicit
 *   route.admin-user-permissions Approve permission
 * - app_user_access_audit table for a password-free audit entry
 *
 * Never accepts privileged tokens or an arbitrary Supabase URL from the caller.
 */
export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return reply(405, "POST required");

    const jwt = (req.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return reply(401, "Sign-in required");

    const { data: requester, error: requesterError } =
      await ctx.supabaseAdmin.auth.getUser(jwt);
    const actorId = requester?.user?.id;
    if (requesterError || !actorId) return reply(401, "Invalid session");

    const [adminCheck, grantCheck] = await Promise.all([
      ctx.supabase.rpc("bb_is_admin"),
      ctx.supabase.rpc("bb_has_module_access", {
        p_module_key: "route.admin-user-permissions", p_action: "approve",
      }),
    ]);
    if (adminCheck.error || grantCheck.error ||
        adminCheck.data !== true || grantCheck.data !== true) {
      return reply(403, "Active Admin and User Permission approval grant required");
    }

    let data: any;
    try {
      data = await req.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return reply(400, "Invalid request");
      }
    } catch { return reply(400, "Invalid JSON"); }

    const targetId = String(data.userId || "").trim();
    const targetEmail = String(data.email || "").toLowerCase().trim();
    const password = typeof data.newPassword === "string" ? data.newPassword : "";
    if (!UUID.test(targetId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return reply(400, "Choose an existing account from User & Permission Manager");
    }
    if (password.length < 12 || password.length > 128 ||
        !/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
      return reply(400, "New password must be 12–128 characters with letters and numbers");
    }

    const { data: account, error: readError } =
      await ctx.supabaseAdmin.auth.admin.getUserById(targetId);
    const existing = account?.user;
    if (readError || !existing || existing.deleted_at ||
        existing.email?.toLowerCase() !== targetEmail) {
      return reply(409, "Selected user ID and login email do not match");
    }

    // Avoid enabling account takeover of another administrator. Self-resets
    // are permitted for an Admin with the explicit Approve grant.
    const { data: roleRow, error: roleError } = await ctx.supabaseAdmin
      .from("app_users").select("role").eq("user_id", targetId).maybeSingle();
    if (roleError) return reply(503, "Could not verify target access role");
    if (roleRow?.role === "admin" && targetId !== actorId) {
      return reply(403, "Another Admin account cannot be reset here");
    }

    // This confirms the placeholder login email without attempting to send
    // mail to a non-existent inbox. It does NOT change the login email.
    const { error: changeError } =
      await ctx.supabaseAdmin.auth.admin.updateUserById(targetId, {
        password,
        email_confirm: true,
      });
    if (changeError) return reply(400, changeError.message || "Password update failed");

    // Deliberately never log or return the password, password hash or token.
    const { error: auditError } = await ctx.supabaseAdmin
      .from("app_user_access_audit")
      .insert({
        actor_user_id: actorId,
        target_user_id: targetId,
        action: "RESET_PASSWORD",
        old_state: null, new_state: null,
        note: "Admin reset the selected Supabase Auth password; credentials not recorded.",
      });
    if (auditError) {
      return reply(503, "Password changed, but audit logging failed. Contact system administrator.");
    }

    return Response.json({
      success: true,
      message: "Password updated for selected account; login email and permissions unchanged.",
      userId: targetId,
    }, { headers: { "Cache-Control": "no-store" } });
  }),
};
