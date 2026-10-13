# BIG BROTHER — Separate Live and Local User Accounts

## Current decision (13 October 2026)

The automatic Local ↔ Live user identity and permission synchronization experiment has been **deferred**. It is not a production feature, and must not be reintroduced just because old branches or commits mention it.

**User-selected approach:** Register the employee separately in Local Brain and Live, then manage their role, staff link, location access and module permissions independently in each environment.

No cross-environment password copying, automatic permission propagation or Auth UUID copying.

## Working features to preserve

- **Register User** in the existing User & Permission Manager. Uses the Supabase environment currently connected to the application (Local or Live); authorized administrators enter an initial password directly instead of depending on a Gmail inbox.
- **Reset Password** for an existing selected account on Live (and on Local only if that same Edge Function has been installed there). Requires explicit privileged permission. This does not change the other environment's password.
- **Invite User** remains available for accounts with real deliverable email.
- **Approve & Save** manually assigns staff links, role, allowed locations and module permissions. Those grants belong to the selected environment.

Do not change the existing live registration, password-reset or permission-save implementation as part of abandoned user synchronization cleanup.

## Backend requirements

The registration endpoint is `supabase/functions/bb-admin-register-user/index.ts`. It uses server-side Supabase Auth admin privileges within the running environment; never accepts a browser-supplied service-role key or a target server URL. It checks explicit User & Permission Manager approval access and legacy allowlist conditions before account creation.

The password-reset endpoint is `supabase/functions/bb-admin-reset-user-password/index.ts`. It changes only the selected environment's Auth password; it does not email a reset link to a placeholder login identifier. Account role and permission grants must remain unchanged.

Registration and password-reset functions need to be installed in **each environment separately**. Updating the GitHub frontend code alone does not install an Edge Function into Local Brain. Verify the correct Local API URL and locally running Edge Functions before relying on offline operation.

Never give an account privileges just because registration succeeded. Review the user in the existing permission manager.

## Retired experiment — do not rely on it

- The experimental **Sync Local Users** button, JSON manifest import UI, and its GitHub Edge Function source `bb-admin-import-local-users` were removed from the active branch.
- Its draft `previewAccess` / `applyAccess` endpoints were **never approved as an operational permission sync**.
- Earlier experimental PowerShell helpers and two-way sync notes do not represent a working production user-sync implementation.
- The historical migration `supabase/migrations/20261012_bb_local_cloud_user_links.sql` stays in version history because it was applied and deleting or editing applied migrations can break database migration consistency. It does **not** mean the abandoned sync project is active. Existing identity-link rows should not be dropped automatically.

GitHub deletion does **not** automatically undeploy an already deployed Supabase Edge Function, delete existing database tables/rows, remove old Git commits, or delete old branches. Any separate retirement of deployed endpoints or old branches should be deliberate; do not change production databases as part of repository cleanup.

## Existing Control Center V3.3

Do not infer from this document that Cloud → Local or Local → Cloud buttons synchronize Auth accounts or permissions. Continue using the approved existing Control Center behavior for data and storage only. Independently assigned Local and Live credentials and permissions remain authoritative in their own systems.

In particular, the old Cloud → Local data merge has historically needed care around `app_users` and related access tables. Treat it as **not permission-safe** until verified or updated; back up your Local environment before a Cloud Refresh after Local-only permission changes.

## Safe employee setup today

1. Register user in Live; set their initial password directly using a trusted admin account.
2. Choose their Live role, staff link, allowed locations and module permissions and save.
3. Register separately in Local Brain and set the Local password.
4. Assign and save Local role, staff link, allowed locations and permissions.
5. Verify each login against the correct backend and retain each environment's separate Auth ID.

This process is manual by design; there is currently no automatic permission sync roadmap attached to it.
