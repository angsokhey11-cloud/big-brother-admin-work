-- BIG BROTHER Local -> Cloud identity reconciliation (metadata only).
-- This is a mapping of identities; never copy auth passwords or roles.
create table if not exists public.bb_local_cloud_user_links (
  source_instance text not null,
  local_user_id uuid not null,
  cloud_user_id uuid not null references auth.users(id) on delete restrict,
  email text not null,
  linked_at timestamptz not null default now(),
  primary key (source_instance, local_user_id),
  constraint bb_local_cloud_user_links_instance_ck check (source_instance ~ '^[a-z0-9][a-z0-9_-]{2,59}$')
);
create unique index if not exists bb_local_cloud_user_links_email_uq
  on public.bb_local_cloud_user_links (source_instance, lower(email));
create unique index if not exists bb_local_cloud_user_links_target_uq
  on public.bb_local_cloud_user_links (source_instance, cloud_user_id);
alter table public.bb_local_cloud_user_links enable row level security;
revoke all on public.bb_local_cloud_user_links from public, anon, authenticated;
grant select, insert on public.bb_local_cloud_user_links to service_role;
comment on table public.bb_local_cloud_user_links is
  'Admin-approved mapping from Local Supabase Auth UUIDs to Live Supabase Auth UUIDs. No passwords or permissions. Managed only by privileged Edge Function.';
