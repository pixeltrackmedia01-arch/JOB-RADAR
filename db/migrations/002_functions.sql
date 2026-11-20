-- JobRadar database functions.

-- ---------------------------------------------------------------- gateway
-- The application server talks to the database through this one function.
-- It is reachable through the Supabase REST endpoint with the public anon key,
-- but refuses every call that does not carry the server-only gateway secret
-- (compared by SHA-256 hash; the raw secret is never stored in the database).
create or replace function public.jobradar_exec(p_secret text, p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = jobradar, public
as $$
declare
  v_hash bytea;
  v_result jsonb;
begin
  select secret_hash into v_hash from jobradar.app_secrets where id = 1;
  if v_hash is null or p_secret is null or length(p_secret) < 32
     or sha256(convert_to(p_secret, 'UTF8')) <> v_hash then
    raise exception 'jobradar gateway: unauthorized' using errcode = '28000';
  end if;
  execute format(
    'with t as (%s) select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from t',
    p_sql
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.jobradar_exec(text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.jobradar_exec(text, text) to anon, authenticated, service_role';
  end if;
end $$;

-- ---------------------------------------------------------------- keywords
-- Builds an OR query from keywords plus their configured synonyms. Each
-- keyword is treated as a phrase ("digital marketing" must appear in order).
create or replace function jobradar.build_keyword_query(p_keywords text[])
returns tsquery
language plpgsql
stable
set search_path = jobradar, public
as $$
declare
  v_term text;
  v_q tsquery;
  v_part tsquery;
begin
  if p_keywords is null or cardinality(p_keywords) = 0 then
    return null;
  end if;
  for v_term in
    select distinct lower(trim(x)) from (
      select unnest(p_keywords) as x
      union all
      select unnest(ks.synonyms)
        from jobradar.keyword_synonyms ks
       where ks.term = any (select lower(trim(k)) from unnest(p_keywords) k)
    ) terms
    where length(trim(x)) > 0
  loop
    v_part := phraseto_tsquery('english', v_term);
    if numnode(v_part) > 0 then
      v_q := case when v_q is null then v_part else v_q || v_part end;
    end if;
  end loop;
  return v_q;
end;
$$;

-- Free-text search query for the public job search: web-search syntax on the
-- raw input, OR-ed with synonym phrases for the full input.
create or replace function jobradar.search_query(p_q text)
returns tsquery
language plpgsql
stable
set search_path = jobradar, public
as $$
declare
  v_base tsquery;
  v_syn tsquery;
begin
  if p_q is null or length(trim(p_q)) = 0 then
    return null;
  end if;
  v_base := websearch_to_tsquery('english', p_q);
  select jobradar.build_keyword_query(ks.synonyms) into v_syn
    from jobradar.keyword_synonyms ks where ks.term = lower(trim(p_q));
  if numnode(v_base) = 0 then
    return v_syn;
  end if;
  return case when v_syn is null then v_base else v_base || v_syn end;
end;
$$;

-- Keep alert_preferences.keyword_query in sync with keywords.
create or replace function jobradar.alert_preferences_sync()
returns trigger
language plpgsql
set search_path = jobradar, public
as $$
begin
  new.keyword_query := jobradar.build_keyword_query(new.keywords);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists alert_preferences_sync on jobradar.alert_preferences;
create trigger alert_preferences_sync
  before insert or update of keywords, category_ids, location_ids, include_remote, salary_min, salary_max,
    experience_min, experience_max, employment_types, work_modes, preferred_sources,
    notification_frequency, notification_channels, notify_on_updates
  on jobradar.alert_preferences
  for each row execute function jobradar.alert_preferences_sync();

-- ---------------------------------------------------------------- ingestion
-- Ingests a batch of normalised jobs from one source.
-- Outcomes per job:
--   inserted  : a genuinely new vacancy (first time in the consolidated DB)
--   updated   : already known from this source, content changed
--   unchanged : already known from this source, nothing changed (re-verified)
--   duplicate : new listing for this source, but the vacancy already exists
--               (linked to the existing consolidated job as another source)
create or replace function jobradar.ingest_jobs(p_source_id uuid, p_jobs jsonb)
returns table (job_id uuid, external_id text, outcome text)
language plpgsql
set search_path = jobradar, public
as $$
#variable_conflict use_column
declare
  j jsonb;
  v_link record;
  v_job_id uuid;
  v_cat uuid;
  v_loc uuid;
  v_dist uuid;
begin
  for j in select * from jsonb_array_elements(p_jobs) loop
    select id into v_cat from jobradar.categories where slug = j->>'category_slug';
    select id into v_loc from jobradar.locations where slug = j->>'location_slug';
    select id into v_dist from jobradar.locations where slug = j->>'district_slug';

    select js.id, js.job_id, js.content_hash into v_link
      from jobradar.job_sources js
     where js.source_id = p_source_id and js.external_id = j->>'external_id';

    if found then
      if v_link.content_hash = j->>'content_hash' then
        update jobradar.job_sources set last_seen_at = now() where id = v_link.id;
        update jobradar.jobs set last_verified_at = now() where id = v_link.job_id;
        job_id := v_link.job_id; external_id := j->>'external_id'; outcome := 'unchanged';
      else
        update jobradar.job_sources
           set last_seen_at = now(), content_hash = j->>'content_hash', source_url = j->>'source_url'
         where id = v_link.id;
        update jobradar.jobs set
          title = j->>'title',
          description = coalesce(j->>'description', ''),
          short_description = coalesce(j->>'short_description', ''),
          category_id = coalesce(v_cat, category_id),
          location_id = coalesce(v_loc, location_id),
          district_id = coalesce(v_dist, district_id),
          location_text = coalesce(j->>'location_text', location_text),
          salary_min = (j->>'salary_min')::numeric,
          salary_max = (j->>'salary_max')::numeric,
          salary_currency = j->>'salary_currency',
          salary_period = j->>'salary_period',
          salary_text = j->>'salary_text',
          experience_min = (j->>'experience_min')::numeric,
          experience_max = (j->>'experience_max')::numeric,
          employment_type = coalesce(j->>'employment_type', employment_type),
          work_mode = coalesce(j->>'work_mode', work_mode),
          skills = coalesce((select array_agg(x) from jsonb_array_elements_text(j->'skills') x), '{}'),
          tags = coalesce((select array_agg(x) from jsonb_array_elements_text(j->'tags') x), '{}'),
          apply_url = coalesce(j->>'apply_url', apply_url),
          last_updated_at = now(),
          last_verified_at = now()
         where id = v_link.job_id;
        job_id := v_link.job_id; external_id := j->>'external_id'; outcome := 'updated';
      end if;
      return next;
      continue;
    end if;

    -- Not seen from this source before. Is it a vacancy we already have?
    insert into jobradar.jobs (
      slug, fingerprint, title, company, description, short_description,
      category_id, location_id, district_id, location_text,
      salary_min, salary_max, salary_currency, salary_period, salary_text,
      experience_min, experience_max, employment_type, work_mode,
      skills, tags, apply_url, original_published_at
    ) values (
      (j->>'slug_base') || '-' || substr(md5(j->>'fingerprint'), 1, 8),
      j->>'fingerprint', j->>'title', j->>'company',
      coalesce(j->>'description', ''), coalesce(j->>'short_description', ''),
      v_cat, v_loc, v_dist, coalesce(j->>'location_text', ''),
      (j->>'salary_min')::numeric, (j->>'salary_max')::numeric,
      j->>'salary_currency', j->>'salary_period', j->>'salary_text',
      (j->>'experience_min')::numeric, (j->>'experience_max')::numeric,
      j->>'employment_type', j->>'work_mode',
      coalesce((select array_agg(x) from jsonb_array_elements_text(j->'skills') x), '{}'),
      coalesce((select array_agg(x) from jsonb_array_elements_text(j->'tags') x), '{}'),
      j->>'apply_url',
      (j->>'published_at')::timestamptz
    )
    on conflict (fingerprint) do nothing
    returning id into v_job_id;

    if v_job_id is not null then
      outcome := 'inserted';
    else
      select id into v_job_id from jobradar.jobs where fingerprint = j->>'fingerprint';
      update jobradar.jobs set last_verified_at = now() where id = v_job_id;
      outcome := 'duplicate';
    end if;

    insert into jobradar.job_sources (job_id, source_id, external_id, source_url, content_hash)
    values (v_job_id, p_source_id, j->>'external_id', j->>'source_url', j->>'content_hash')
    on conflict (source_id, external_id) do nothing;

    job_id := v_job_id; external_id := j->>'external_id';
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- matching
-- Matches a batch of jobs against active alert preferences entirely inside
-- the database and records one notification_event per (subscription, job).
-- Existing events are left untouched (ON CONFLICT DO NOTHING), which is what
-- prevents duplicate notifications on re-imports, refreshes and re-indexing.
create or replace function jobradar.match_jobs(p_job_ids uuid[], p_event_type text, p_run_id uuid)
returns table (event_id uuid, subscription_id uuid, job_id uuid)
language sql
set search_path = jobradar, public
as $$
  insert into jobradar.notification_events as ne (subscription_id, job_id, event_type, run_id)
  select s.id, j.id, p_event_type, p_run_id
    from jobradar.jobs j
    join jobradar.alert_preferences p on true
    join jobradar.alert_subscriptions s on s.id = p.subscription_id and s.status = 'active'
   where j.id = any (p_job_ids)
     and j.status = 'active'
     and (p_event_type = 'new_job_match' or p.notify_on_updates)
     -- keywords + synonyms (title, skills, company, description)
     and (p.keyword_query is null or j.search_vector @@ p.keyword_query)
     -- category
     and (cardinality(p.category_ids) = 0 or p.category_ids @> array[j.category_id])
     -- location: city, district, district's parent city (jobs that do not name
     -- a district), or remote
     and (
       (cardinality(p.location_ids) = 0 and not p.include_remote)
       or (p.include_remote and j.work_mode = 'remote')
       or p.location_ids @> array[j.location_id]
       or p.location_ids @> array[j.district_id]
       or (j.district_id is null and exists (
             select 1 from jobradar.locations d
              where d.id = any (p.location_ids) and d.parent_id = j.location_id))
     )
     -- salary (annual INR), compared only when the job discloses it in INR
     and (p.salary_min is null or j.salary_max is null or coalesce(j.salary_currency, 'INR') <> 'INR'
          or j.salary_max >= p.salary_min)
     and (p.salary_max is null or j.salary_min is null or coalesce(j.salary_currency, 'INR') <> 'INR'
          or j.salary_min <= p.salary_max)
     -- experience range overlap, when the job states it
     and (p.experience_max is null or j.experience_min is null or j.experience_min <= p.experience_max)
     and (p.experience_min is null or j.experience_max is null or j.experience_max >= p.experience_min)
     -- employment type / work mode
     and (cardinality(p.employment_types) = 0 or j.employment_type = any (p.employment_types))
     and (cardinality(p.work_modes) = 0 or j.work_mode = any (p.work_modes))
     -- preferred sources
     and (cardinality(p.preferred_sources) = 0 or exists (
           select 1 from jobradar.job_sources js join jobradar.sources so on so.id = js.source_id
            where js.job_id = j.id and so.slug = any (p.preferred_sources)))
  on conflict (subscription_id, job_id, event_type) do nothing
  returning ne.id, ne.subscription_id, ne.job_id;
$$;

-- ---------------------------------------------------------------- scheduling
-- Aligned slot helpers (UTC epoch multiples: a 30-minute interval gives :00/:30).
create or replace function jobradar.slot_floor(p_ts timestamptz, p_minutes integer)
returns timestamptz language sql immutable as $$
  select to_timestamp(floor(extract(epoch from p_ts) / (p_minutes * 60)) * (p_minutes * 60));
$$;

create or replace function jobradar.slot_next(p_ts timestamptz, p_minutes integer)
returns timestamptz language sql immutable as $$
  select to_timestamp((floor(extract(epoch from p_ts) / (p_minutes * 60)) + 1) * (p_minutes * 60));
$$;

-- Atomically claims due (or explicitly requested) sources. A claimed schedule
-- is locked so concurrent ticks / manual runs cannot start the same source.
-- Source permission, enablement and the source's minimum interval are always
-- enforced, including for manual runs.
create or replace function jobradar.claim_sources(
  p_now timestamptz, p_runner uuid, p_lock_minutes integer,
  p_source_ids uuid[], p_force boolean
)
returns table (
  source_id uuid, slug text, effective_interval integer, slot timestamptz,
  previous_next_run_at timestamptz, missed_windows integer
)
language sql
set search_path = jobradar, public
as $$
  with candidates as (
    select cs.id, cs.source_id, s.slug,
           greatest(cs.interval_minutes, s.min_interval_minutes) as eff,
           cs.next_run_at as prev_next
      from jobradar.collection_schedules cs
      join jobradar.sources s on s.id = cs.source_id
     where s.is_enabled
       and s.permission_status = 'permitted'
       and (p_force or cs.is_enabled)
       and (p_source_ids is null or cs.source_id = any (p_source_ids))
       and (p_force or cs.next_run_at <= p_now)
       and (cs.locked_until is null or cs.locked_until < p_now)
       -- never more often than the source permits (2 minute tick grace)
       and (cs.last_run_at is null
            or cs.last_run_at <= p_now - make_interval(mins => s.min_interval_minutes) + interval '2 minutes')
     for update of cs skip locked
  )
  update jobradar.collection_schedules cs
     set locked_until = p_now + make_interval(mins => p_lock_minutes),
         locked_by = p_runner,
         last_run_at = p_now,
         next_run_at = jobradar.slot_next(p_now, c.eff),
         updated_at = p_now
    from candidates c
   where cs.id = c.id
  returning c.source_id, c.slug, c.eff, jobradar.slot_floor(p_now, c.eff), c.prev_next,
            greatest(0, floor(extract(epoch from (p_now - c.prev_next)) / (c.eff * 60))::integer);
$$;
