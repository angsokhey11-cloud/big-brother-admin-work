import { withSupabase } from "npm:@supabase/server@1.5.3";

/** Cloud-side import of reviewed Local Auth identities (not credentials). */
type UserRow = { localUserId: string; email: string };
const ACTIVATION_URL =
  "https://angsokhey11-cloud.github.io/big-brother-admin-work/activate-account.html";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (message: string, status: number) =>
  Response.json({ success: false, message }, { status });


type Snapshot = {
  role: "viewer" | "editor" | "admin";
  active: boolean;
  staffId: string;
  locations: string[];
  modules: Array<{ moduleKey: string; canView: boolean; canCreate: boolean; canEdit: boolean; canApprove: boolean }>;
};
function normalizeAccess(raw: any): Snapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid permission snapshot");
  const role = String(raw.role || "").toLowerCase();
  if (!["viewer", "editor", "admin"].includes(role)) throw new Error("Invalid account role");
  if (typeof raw.active !== "boolean") throw new Error("Missing account active status");
  const staffId = String(raw.staffId || "").trim();
  if (staffId.length > 128) throw new Error("Invalid staff ID");
  if (!Array.isArray(raw.locations) || raw.locations.length > 150 ||
      !Array.isArray(raw.modules) || raw.modules.length > 500) throw new Error("Invalid access arrays");
  const locations = raw.locations.map((x: unknown) => String(x).trim()).sort();
  if (locations.some((x: string) => !x || x.length > 128) || new Set(locations).size !== locations.length) {
    throw new Error("Duplicate or invalid location");
  }
  const modules = raw.modules.map((m: any) => {
    if (!m || typeof m !== "object") throw new Error("Invalid module");
    const moduleKey = String(m.moduleKey || "").trim();
    if (!moduleKey || moduleKey.length > 200) throw new Error("Invalid module key");
    for (const key of ["canView", "canCreate", "canEdit", "canApprove"]) {
      if (typeof m[key] !== "boolean") throw new Error("Invalid module permission flags");
    }
    return {
      moduleKey, canView: m.canView || m.canCreate || m.canEdit || m.canApprove,
      canCreate: m.canCreate, canEdit: m.canEdit, canApprove: m.canApprove,
    };
  }).filter((m:any) => m.canView || m.canCreate || m.canEdit || m.canApprove)
    .sort((a: any,b: any) => a.moduleKey.localeCompare(b.moduleKey));
  if (new Set(modules.map((m: any) => m.moduleKey)).size !== modules.length) {
    throw new Error("Duplicate module key");
  }
  return { role: role as Snapshot["role"], active: raw.active, staffId, locations, modules };
}
async function snapshotHash(snapshot: Snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, x => x.toString(16).padStart(2, "0")).join("");
}
async function handlePermissionSync(body: any, ctx: any) {
  const source = String(body?.sourceInstance || "");
  if (!/^[a-z0-9][a-z0-9_-]{2,59}$/.test(source)) return fail("Invalid Local instance identifier", 400);
  const u = body?.user || {};
  const local = String(u.localUserId || "").toLowerCase();
  const email = String(u.email || "").trim().toLowerCase();
  if (!UUID.test(local) || !EMAIL.test(email)) return fail("Invalid Local user identity", 400);
  let requested: Snapshot;
  try { requested = normalizeAccess(u.access); }
  catch (e) { return fail(e instanceof Error ? e.message : "Invalid access", 400); }

  // A valid cloud-side mapping is mandatory. Never trust client-supplied cloud UUIDs.
  const { data: link, error: linkError } = await ctx.supabaseAdmin.rpc(
    "bb_local_cloud_link_lookup", { p_source: source, p_local: local },
  );
  if (linkError || !link || String(link.email).toLowerCase() !== email) {
    return fail("Identity mapping missing or email mismatch; sync account identity first", 409);
  }
  const cloudId = String(link.cloud_user_id || "");
  if (!UUID.test(cloudId)) return fail("Linked Cloud Auth user is invalid", 409);

  const { data: current, error: detailError } = await ctx.supabase.rpc(
    "bb_user_access_admin_detail", { p_user_id: cloudId },
  );
  if (detailError || !current?.user || String(current.user.email).toLowerCase() !== email) {
    return fail("Cannot inspect the linked Cloud user's current permissions", 409);
  }

  const { data: catalog, error: catalogError } = await ctx.supabase.rpc("bb_user_access_admin_bootstrap");
  if (catalogError || !catalog) return fail("Cannot verify current permission catalog", 503);
  const knownModules = new Map((catalog.modules || []).map((m: any) => [m.moduleKey, m]));
  const currentModules = (current.modules || []).filter((m: any) => knownModules.has(m.moduleKey));
  let old: Snapshot;
  try {
    old = normalizeAccess({
      role: current.user.role, active: !!current.user.active,
      staffId: current.user.staffId || "",
      locations: current.locations || [], modules: currentModules,
    });
  } catch { return fail("Existing Cloud permissions could not be normalized", 409); }

  if (requested.staffId) {
    const staff = (catalog.staff || []).find((x: any) => x.staffId === requested.staffId);
    if (!staff) return fail("Local staff ID is missing in Cloud; sync Staff Management first", 409);
    if (staff.linkedUserId && staff.linkedUserId !== cloudId) return fail("Cloud staff is linked to another account", 409);
  }
  const knownLocations = new Set((catalog.locations || []).map((x: any) => x.locationCode));
  if (requested.locations.some(x => !knownLocations.has(x))) {
    return fail("Some Local locations are missing in Cloud", 409);
  }
  for (const m of requested.modules) {
    const c: any = knownModules.get(m.moduleKey);
    if (!c) return fail("Unknown or nonmanager module in Local snapshot: " + m.moduleKey, 409);
    if ((m.canCreate && !c.allowCreate) || (m.canEdit && !c.allowEdit) || (m.canApprove && !c.allowApprove)) {
      return fail("Unsupported permission for module: " + m.moduleKey, 409);
    }
  }
  const before = await snapshotHash(old);
  const desired = await snapshotHash(requested);
  if (body.operation === "previewAccess") {
    return Response.json({
      success: true, email, current: old, requested,
      currentHash: before, requestedHash: desired,
      alreadyAligned: before === desired, requiresReview: true,
    });
  }
  if (body.operation !== "applyAccess") return fail("Unsupported sync operation", 400);
  if (!/^[a-f0-9]{64}$/.test(String(body.expectedCloudHash || "")) ||
      String(body.expectedCloudHash) !== before ||
      String(body.expectedLocalHash || "") !== desired) {
    return fail("Permissions changed since preview; review again before applying", 409);
  }
  if (before === desired) return Response.json({ success: true, state: "already-aligned" });

  // Uses the existing approved-and-audited permission save path.
  const { data: result, error: saveError } = await ctx.supabase.rpc(
    "bb_user_access_admin_save", { p_payload: {
      userId: cloudId, role: requested.role, active: requested.active,
      staffId: requested.staffId, locations: requested.locations,
      modules: requested.modules,
      note: "Reviewed Local-to-Cloud permissions sync; local user "+local,
    }},
  );
  if (saveError || !result?.saved) {
    return fail(saveError?.message || "Permission save did not complete", 409);
  }
  const { data: updated, error: verifyError } = await ctx.supabase.rpc(
    "bb_user_access_admin_detail", { p_user_id: cloudId },
  );
  if (verifyError || !updated?.user) return fail("Saved, but verification read failed; inspect manually", 503);
  const updatedAccess = normalizeAccess({
    role: updated.user.role, active: !!updated.user.active,
    staffId: updated.user.staffId || "", locations: updated.locations || [],
    modules: (updated.modules || []).filter((m:any) => knownModules.has(m.moduleKey)),
  });
  if (await snapshotHash(updatedAccess) !== desired) {
    return fail("Save completed but permission verification differs; inspect manually", 409);
  }
  return Response.json({ success: true, state: "applied-and-verified", email });
}

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

    let body: { sourceInstance?: unknown; users?: unknown; operation?: unknown; user?: unknown; expectedCloudHash?: unknown; expectedLocalHash?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON", 400);
    }
    if (body?.operation === "previewAccess" || body?.operation === "applyAccess") {
      return await handlePermissionSync(body, ctx);
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
