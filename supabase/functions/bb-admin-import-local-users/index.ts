import { withSupabase } from "npm:@supabase/server@1.5.3";

/** Cloud-side import of reviewed Local Auth identities (not credentials). */
type UserRow = { localUserId: string; email: string };
const ACTIVATION_URL =
  "https://angsokhey11-cloud.github.io/big-brother-admin-work/activate-account.html";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (message: string, status: number) =>
  Response.json({ success: false, message }, { status });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return fail("POST required", 405);

    const { data: authorized, error: permissionError } =
      await ctx.supabase.rpc("bb_has_module_access", {
        p_module_key: "route.admin-user-permissions",
        p_action: "approve",
      });
    if (permissionError || authorized !== true) {
      return fail("User & Permission Manager approval permission required", 403);
    }

    let body: { sourceInstance?: unknown; users?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON", 400);
    }
    const sourceInstance = String(body?.sourceInstance ?? "").trim();
    if (!/^[a-z0-9][a-z0-9_-]{2,59}$/.test(sourceInstance)) {
      return fail("Invalid Local Brain instance identifier", 400);
    }
    if (!Array.isArray(body?.users) || body.users.length < 1 ||
      body.users.length > 50) {
      return fail("Provide 1 to 50 Local users per import batch", 400);
    }

    const rows: UserRow[] = [];
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    for (const row of body.users) {
      if (!row || typeof row !== "object") return fail("Invalid Local user row", 400);
      const localUserId = String(row.localUserId || "").toLowerCase().trim();
      const email = String(row.email || "").toLowerCase().trim();
      if (!UUID.test(localUserId) || !EMAIL.test(email) || email.length > 254) {
        return fail("Invalid Local user identifier or email", 400);
      }
      if (seenIds.has(localUserId) || seenEmails.has(email)) {
        return fail("Duplicate user ID or email in submitted batch", 400);
      }
      seenIds.add(localUserId);
      seenEmails.add(email);
      rows.push({ localUserId, email });
    }

    // Build a bounded account index. Never accept a "cloudUserId" from input.
    // This avoids overwriting existing account credentials or privileges.
    const accounts = new Map<string, string>();
    let exhausted = false;
    for (let page = 1; page <= 40; page++) {
      const { data, error } = await ctx.supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) return fail("Could not list existing Live Auth users", 503);
      for (const user of data?.users || []) {
        if (user.email) accounts.set(user.email.toLowerCase(), user.id);
      }
      if ((data?.users || []).length < 200) { exhausted = true; break; }
    }
    if (!exhausted) return fail("Too many users for safe automated matching", 409);

    const results: Array<{
      localUserId: string; email: string; state: string; message?: string;
    }> = [];

    for (const row of rows) {
      try {
        const { data: existing, error: mappingError } = await ctx.supabaseAdmin
          .rpc("bb_local_cloud_link_lookup", {
            p_source: sourceInstance, p_local: row.localUserId,
          });
        if (mappingError) throw new Error("Identity mapping lookup failed");
        if (existing) {
          if (String(existing.email).toLowerCase() !== row.email) {
            throw new Error("Existing Local identity mapping has a different email");
          }
          const liveId = accounts.get(row.email);
          if (!liveId || liveId !== existing.cloud_user_id) {
            throw new Error("Existing mapping does not match Live Auth; review manually");
          }
          results.push({ ...row, state: "already-linked" });
          continue;
        }

        const { data: conflicting, error: conflictErr } = await ctx.supabaseAdmin
          .rpc("bb_local_cloud_link_email_in_use", {
            p_source: sourceInstance, p_email: row.email,
          });
        if (conflictErr) throw new Error("Identity conflict lookup failed");
        if (conflicting === true) {
          throw new Error("Email already mapped to another Local user");
        }

        let cloudId = accounts.get(row.email);
        let state = "matched-existing";
        if (!cloudId) {
          // Prevent any legacy allowlist entry from auto-granting access
          // via the Auth-to-app_users creation trigger.
          const { data: allowedLegacy, error: allowErr } = await ctx.supabaseAdmin
            .from("app_user_allowlist")
            .select("email").eq("email", row.email).limit(1);
          if (allowErr) throw new Error("Legacy allowlist could not be checked");
          if ((allowedLegacy || []).length) {
            throw new Error("Legacy allowlist entry must be reviewed before inviting");
          }

          // Invitation creates a NEW Cloud credential flow. No Local password is copied.
          const { data: invited, error: inviteErr } =
            await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(row.email, {
              redirectTo: ACTIVATION_URL,
            });
          if (inviteErr || !invited.user?.id) {
            throw new Error(inviteErr?.message || "Cloud invitation failed");
          }
          cloudId = invited.user.id;
          accounts.set(row.email, cloudId);
          state = "invited-to-cloud";
        }

        const { error: insertError } = await ctx.supabaseAdmin
          .rpc("bb_local_cloud_link_create", {
            p_source: sourceInstance, p_local: row.localUserId,
            p_cloud: cloudId, p_email: row.email,
          });
        if (insertError) {
          throw new Error("Cloud Auth account exists but ID mapping was not saved: " +
            insertError.message);
        }
        results.push({ ...row, state });
      } catch (e) {
        results.push({
          ...row,
          state: "needs-review",
          message: e instanceof Error ? e.message : "Unknown import failure",
        });
      }
    }

    return Response.json({
      success: true,
      imported: results.filter((r) => r.state !== "needs-review").length,
      review: results.filter((r) => r.state === "needs-review").length,
      results,
      note: "Cloud permissions remain unchanged. Admin must verify staff and grants.",
    });
  }),
};
