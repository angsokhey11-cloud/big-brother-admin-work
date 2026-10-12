-- BIG BROTHER Local-to-Cloud user identity mapping.
-- FINAL DESIGN: private schema, excluded from Control Center public data-only dumps.
-- Supabase Auth credentials and permissions are NEVER stored here.
-- Deploy by an authorized DBA only after validating your environment.
create schema if not exists bb_private;
revoke all on schema bb_private from public, anon, authenticated;

create table if not exists bb_private.local_cloud_user_links (
 source_instance text not null,
 local_user_id uuid not null,
 cloud_user_id uuid not null references auth.users(id) on delete restrict,
 email text not null,
 linked_at timestamptz not null default now(),
 primary key(source_instance,local_user_id),
 constraint bb_private_source_name_check check(source_instance ~ '^[a-z0-9][a-z0-9_-]{2,59}$')
);
create unique index if not exists bb_private_local_links_email_unique on bb_private.local_cloud_user_links(source_instance,lower(email));
create unique index if not exists bb_private_local_links_cloud_unique on bb_private.local_cloud_user_links(source_instance,cloud_user_id);

create or replace function public.bb_local_cloud_link_lookup(p_source text,p_local uuid)
 returns jsonb language sql stable security definer set search_path=pg_catalog,bb_private
 as $$ select jsonb_build_object('cloud_user_id',cloud_user_id,'email',email)
  from bb_private.local_cloud_user_links
  where source_instance=p_source and local_user_id=p_local $$;
create or replace function public.bb_local_cloud_link_email_in_use(p_source text,p_email text)
 returns boolean language sql stable security definer set search_path=pg_catalog,bb_private
 as $$ select exists(select 1 from bb_private.local_cloud_user_links
  where source_instance=p_source and lower(email)=lower(p_email)) $$;
create or replace function public.bb_local_cloud_link_create(p_source text,p_local uuid,p_cloud uuid,p_email text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,bb_private
 as $$
 declare v_email text; v_existing record;
 begin
  v_email:=lower(trim(coalesce(p_email,'')));
  if p_source !~ '^[a-z0-9][a-z0-9_-]{2,59}$' or v_email='' then
   raise exception 'Invalid Local identity mapping';
  end if;
  if not exists(select 1 from auth.users where id=p_cloud and lower(email)=v_email and deleted_at is null) then
   raise exception 'Cloud Auth ID/email mismatch';
  end if;
  select * into v_existing from bb_private.local_cloud_user_links
    where source_instance=p_source and local_user_id=p_local;
  if found then
   if v_existing.cloud_user_id<>p_cloud or lower(v_existing.email)<>v_email then
    raise exception 'Local identity mapping conflict';
   end if;
   return jsonb_build_object('state','already-linked');
  end if;
  insert into bb_private.local_cloud_user_links(source_instance,local_user_id,cloud_user_id,email)
  values (p_source,p_local,p_cloud,v_email);
  return jsonb_build_object('state','linked');
 end;
 $$;
revoke all on function public.bb_local_cloud_link_lookup(text,uuid) from public, anon, authenticated;
revoke all on function public.bb_local_cloud_link_email_in_use(text,text) from public, anon, authenticated;
revoke all on function public.bb_local_cloud_link_create(text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.bb_local_cloud_link_lookup(text,uuid) to service_role;
grant execute on function public.bb_local_cloud_link_email_in_use(text,text) to service_role;
grant execute on function public.bb_local_cloud_link_create(text,uuid,uuid,text) to service_role;

-- NOTE: Existing Live site applied a one-time conversion from a temporary
-- public mapping table. That temporary public table has been removed.
-- Do NOT keep a mapping table in public: V3.3 Cloud Refresh stages public data.
