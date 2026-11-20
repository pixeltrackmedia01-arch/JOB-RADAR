-- India-only JobRadar: more Indian cities, India company job-board sources,
-- precise keyword search, and removal of listings located outside India.

insert into jobradar.locations (slug, name, kind, state, aliases, sort_order) values
  ('india', 'India (other / multiple cities)', 'city', null, array['india','pan india','pan-india','multiple locations india'], 90),
  ('coimbatore', 'Coimbatore', 'city', 'Tamil Nadu', array['coimbatore'], 21),
  ('nagpur', 'Nagpur', 'city', 'Maharashtra', array['nagpur'], 22),
  ('nashik', 'Nashik', 'city', 'Maharashtra', array['nashik','nasik'], 23),
  ('lucknow', 'Lucknow', 'city', 'Uttar Pradesh', array['lucknow'], 24),
  ('bhopal', 'Bhopal', 'city', 'Madhya Pradesh', array['bhopal'], 25),
  ('bhubaneswar', 'Bhubaneswar', 'city', 'Odisha', array['bhubaneswar','bhubaneshwar'], 26),
  ('thiruvananthapuram', 'Thiruvananthapuram', 'city', 'Kerala', array['thiruvananthapuram','trivandrum'], 27),
  ('mysuru', 'Mysuru', 'city', 'Karnataka', array['mysuru','mysore'], 28),
  ('visakhapatnam', 'Visakhapatnam', 'city', 'Andhra Pradesh', array['visakhapatnam','vizag'], 29),
  ('goa', 'Goa', 'city', 'Goa', array['goa','panaji'], 30),
  ('bharuch', 'Bharuch', 'city', 'Gujarat', array['bharuch','ankleshwar'], 7),
  ('vapi', 'Vapi', 'city', 'Gujarat', array['vapi','valsad'], 8),
  ('navsari', 'Navsari', 'city', 'Gujarat', array['navsari'], 9)
on conflict (slug) do update set name = excluded.name, aliases = excluded.aliases, state = excluded.state, sort_order = excluded.sort_order;

-- Gurugram/Noida etc. are part of Delhi NCR; Bengaluru has "bangalore urban".
update jobradar.locations set aliases = array['bengaluru','bangalore','bangalore urban','bengaluru urban'] where slug = 'bengaluru';

-- New India sources: official public company job boards (Greenhouse, Lever, Ashby).
insert into jobradar.sources (slug, name, source_type, homepage_url, terms_url, attribution, is_enabled,
  permission_status, permission_notes, min_interval_minutes, max_requests_per_cycle, max_retries,
  rate_limit_per_minute, timeout_ms, health_status) values
  ('greenhouse-india', 'Company careers (Greenhouse)', 'api', 'https://www.greenhouse.com', 'https://developers.greenhouse.io/job-board.html',
   'Company careers page (Greenhouse)', true, 'permitted',
   'Official public Job Board API that companies publish for displaying their openings. Boards: Razorpay, Groww, InMobi, Druva, HighRadius, Glance, Observe.AI. One request per company per cycle; India locations only.',
   30, 7, 3, 30, 20000, 'unknown'),
  ('lever-india', 'Company careers (Lever)', 'api', 'https://www.lever.co', 'https://github.com/lever/postings-api',
   'Company careers page (Lever)', true, 'permitted',
   'Official public Postings API. Boards: Paytm, Meesho, CRED, Zeta, FamPay, Mindtickle, Pocket FM. One request per company per cycle; India locations only.',
   30, 7, 3, 30, 20000, 'unknown'),
  ('ashby-india', 'Company careers (Ashby)', 'api', 'https://www.ashbyhq.com', 'https://developers.ashbyhq.com/docs/public-job-posting-api',
   'Company careers page (Ashby)', true, 'permitted',
   'Official public Job Posting API. Boards: Sarvam AI, Tekion, Atlan. One request per company per cycle; India locations only.',
   30, 3, 3, 30, 20000, 'unknown')
on conflict (slug) do update set name = excluded.name, permission_notes = excluded.permission_notes,
  max_requests_per_cycle = excluded.max_requests_per_cycle, rate_limit_per_minute = excluded.rate_limit_per_minute;

insert into jobradar.collection_schedules (source_id, interval_minutes, is_enabled, next_run_at)
select s.id, greatest(30, s.min_interval_minutes), true, now() from jobradar.sources s
on conflict (source_id) do nothing;

update jobradar.sources set is_enabled = false, health_status = 'disabled',
  permission_notes = 'Disabled: Arbeitnow lists jobs in Germany/Europe only, and JobRadar is India-only.'
 where slug = 'arbeitnow';
update jobradar.sources set
  permission_notes = 'Public JSON API; attribution + follow link-back required (shown on every job). Hourly, single request. Only listings located in or remote within India are kept.'
 where slug = 'remoteok';

-- Precise search vector: title, skills, tags, company and location (no
-- description), so a keyword search returns jobs that are actually about it.
alter table jobradar.jobs add column if not exists primary_vector tsvector generated always as (
  setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english'::regconfig, jobradar.join_words(skills) || ' ' || jobradar.join_words(tags)), 'B') ||
  setweight(to_tsvector('english'::regconfig, coalesce(company, '')), 'B') ||
  setweight(to_tsvector('english'::regconfig, coalesce(location_text, '')), 'C')
) stored;
create index if not exists jobs_primary_search_idx on jobradar.jobs using gin(primary_vector);
create index if not exists jobs_posted_idx on jobradar.jobs ((coalesce(original_published_at, first_discovered_at)) desc);

-- Alert keywords match title/skills/company/location (not loose description words).
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
     and (p.keyword_query is null or j.primary_vector @@ p.keyword_query)
     and (cardinality(p.category_ids) = 0 or p.category_ids @> array[j.category_id])
     and (
       (cardinality(p.location_ids) = 0 and not p.include_remote)
       or (p.include_remote and j.work_mode = 'remote')
       or p.location_ids @> array[j.location_id]
       or p.location_ids @> array[j.district_id]
       or (j.district_id is null and exists (
             select 1 from jobradar.locations d
              where d.id = any (p.location_ids) and d.parent_id = j.location_id))
     )
     and (p.salary_min is null or j.salary_max is null or coalesce(j.salary_currency, 'INR') <> 'INR'
          or j.salary_max >= p.salary_min)
     and (p.salary_max is null or j.salary_min is null or coalesce(j.salary_currency, 'INR') <> 'INR'
          or j.salary_min <= p.salary_max)
     and (p.experience_max is null or j.experience_min is null or j.experience_min <= p.experience_max)
     and (p.experience_min is null or j.experience_max is null or j.experience_max >= p.experience_min)
     and (cardinality(p.employment_types) = 0 or j.employment_type = any (p.employment_types))
     and (cardinality(p.work_modes) = 0 or j.work_mode = any (p.work_modes))
     and (cardinality(p.preferred_sources) = 0 or exists (
           select 1 from jobradar.job_sources js join jobradar.sources so on so.id = js.source_id
            where js.job_id = j.id and so.slug = any (p.preferred_sources)))
  on conflict (subscription_id, job_id, event_type) do nothing
  returning ne.id, ne.subscription_id, ne.job_id;
$$;

-- Remove listings located outside India (collected before the India-only rule).
delete from jobradar.jobs j
 where not (
   j.location_text ~* '\m(india|bharat|maharashtra|karnataka|gujarat|telangana|tamil nadu|kerala|haryana|uttar pradesh|west bengal|rajasthan|madhya pradesh|andhra pradesh|odisha|punjab|goa)\M'
   or j.district_id is not null
   or (j.location_id is not null and j.location_id <> (select id from jobradar.locations where slug = 'remote'))
 );

-- Looser fallback for multi-word searches: any of the words (plus synonyms).
create or replace function jobradar.search_query_any(p_q text)
returns tsquery
language plpgsql
stable
set search_path = jobradar, public
as $$
declare
  v_words text[];
begin
  if p_q is null or length(trim(p_q)) = 0 then return null; end if;
  v_words := regexp_split_to_array(lower(trim(p_q)), '[^[:alnum:]+#.]+');
  return jobradar.build_keyword_query(array_append(v_words, lower(trim(p_q))));
end;
$$;
