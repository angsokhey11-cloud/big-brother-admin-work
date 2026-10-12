# BIG BROTHER — Shared Live / Local User Registration (V1)

## Scope and safety
This change adds **Register User** next to **Invite User** in the existing User & Permission Manager V3. It does not replace the existing permission editor or registration-by-invitation flow.

- Runs the **same** frontend code for Live and Local Brain.
- Browser calls `<active SUPABASE URL>/functions/v1/bb-admin-register-user`.
- Supabase Edge Function uses **its own environment** to create the account. It never accepts a user-supplied Supabase URL or privileged API key.
- Must be deployed **separately to both Live and Local Supabase**. Code Sync alone cannot deploy an Edge Function to a running Supabase installation.
- This branch is a staging prototype. Do not merge or deploy before an admin verifies its behavior on a nonproduction copy.

## Architecture
**Frontend:** `user-permissions.html` (same file in both environments). Existing V5 Local Brain web server rewrites the configured cloud Supabase URL to its local Supabase URL while serving pages. This mechanism must be rechecked when moving to the V6 HTTPS LAN gateway.

**Backend:** `supabase/functions/bb-admin-register-user/index.ts`. Same Edge Function source installed to each Supabase backend. Uses the existing authenticated-user middleware `npm:@supabase/server@1.5.3` and `ctx.supabaseAdmin.auth.admin.createUser`.

**Authorization:** Server calls `bb_has_module_access('route.admin-user-permissions','approve')`. Neither client-side UI checks nor merely possessing the Admin role bypasses that explicit permission. Admin/service-role API credentials are never placed in browser code.

**Post-registration:** The new Auth user must be saved via existing `bb_user_access_admin_save` (staff link, location grants, module grants, role and active flag) before BIG BROTHER application access. If no user record is approved, `bb_current_access_profile` denies application use.

**Legacy allowlist:** Existing Auth trigger `trg_bb_sync_app_user_from_auth` can auto-approve allowlisted email addresses. To prevent surprise privileges, direct registration refuses email addresses already present in `app_user_allowlist`. Review/remove legacy entries with an authorized admin workflow before continuing.

**Offline:** No verification email is sent. Admin directly sets an initial strong password. Employee receives password privately and should change it. If password change enforcement is required, add that feature to the sign-in flow separately; this version does not enforce it.

## Prerequisites in *each* environment
1. `bb_has_module_access` RPC with explicit `approve` permission.
2. `app_user_allowlist`, Auth-to-app-users trigger, and `bb_user_access_admin_save` / `bb_current_access_profile`.
3. Installed and running Supabase Auth and Edge Functions runtime, with the function code and its package dependencies cached **before** disconnected operation.
4. Correct CORS, Origin and URL rewrites; no cloud endpoint fallback when in Local mode.
5. Working Local admin account with User & Permission Manager **Approve** grant; separate from the accounts being created.

## Deployment and testing — NOT AUTOMATIC
1. Back up Live and Local separately. Keep V5 unchanged while testing.
2. Verify actual `Local Brain/supabase` configuration and Edge Function directory used by the V5 launcher. Copy the function folder into that project's `supabase/functions` location and start its Edge runtime; do **not** install files into a guessed path.
3. Deploy this function to Live independently through your normal Supabase deployment workflow, only after staging tests and approval.
4. Point the application to the correct environment. Check browser Network logs to confirm the registration request target for each environment.
5. With a test admin, create a **new non-allowlisted** test Auth user; confirm it appears as waiting approval. Ensure it cannot use company data before grants.
6. Link test user to test staff/location/modules via existing permission editor. Confirm login, granted access and denied modules.
7. Remove network connectivity **while Local Supabase is running**; register a second test account locally and verify sign-in + permissions. Do not rely on an internet-delivered JS library on cold start.
8. Reconnect to internet and verify the offline test account was not added to Live, and Live registration did not touch Local.
9. Test duplicate email, invalid password, unauthorized actor, legacy allowlisted email and disabling an account.
10. Confirm Cloud Refresh does not overwrite or delete locally registered accounts and any locally edited staff/permissions. Existing sync protections need separate verification before permanent production use.

## Warning: Local vs Live isolation
The existing V5 server rewrites hard-coded cloud URLs; registration is routed to **whatever API URL the active app actually uses**. Full Local-only routing remains a separate prerequisite. Do not assume all 32 repos are safely isolated based on this one registration feature.

## Change status
- Branch-only frontend + Edge Function source.
- No live user accounts created, no SQL applied, no Edge Function deployed and no Local Brain files changed.
- Reviewed frontend JavaScript syntax and permission paths. Real backend integration testing remains outstanding.
