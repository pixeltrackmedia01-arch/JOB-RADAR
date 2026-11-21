-- Allow more than one gateway secret (e.g. two Vercel projects sharing this
-- database, or rotating a secret without downtime). Each row stores only the
-- SHA-256 of a secret; the gateway accepts a request matching any row.
alter table jobradar.app_secrets drop constraint if exists app_secrets_id_check;
alter table jobradar.app_secrets add constraint app_secrets_id_check check (id between 1 and 10);
alter table jobradar.app_secrets add column if not exists label text;

create or replace function public.jobradar_exec(p_secret text, p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = jobradar, public
as $$
declare
  v_result jsonb;
begin
  if p_secret is null or length(p_secret) < 32
     or not exists (select 1 from jobradar.app_secrets where secret_hash = sha256(convert_to(p_secret, 'UTF8'))) then
    raise exception 'jobradar gateway: unauthorized' using errcode = '28000';
  end if;
  execute format(
    'with t as (%s) select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from t',
    p_sql
  ) into v_result;
  return v_result;
end;
$$;
