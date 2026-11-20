-- JobRadar core schema. Everything lives in the isolated `jobradar` schema.
-- All tables have RLS enabled with no policies, and the schema is not granted
-- to anon/authenticated: the only way in is the secret-gated server gateway
-- function defined in 002_functions.sql.

create schema if not exists jobradar;

-- ---------------------------------------------------------------- internals
create table if not exists jobradar.app_secrets (
  id smallint primary key default 1 check (id = 1),
  secret_hash bytea not null,
  updated_at timestamptz not null default now()
);

create table if not exists jobradar.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists jobradar.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------- taxonomy
create table if not exists jobradar.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  keywords text[] not null default '{}',
  sort_order integer not null default 100
);

create table if not exists jobradar.locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('city', 'district', 'remote')),
  state text,
  parent_id uuid references jobradar.locations(id) on delete cascade,
  aliases text[] not null default '{}',
  sort_order integer not null default 100
);
create index if not exists locations_parent_idx on jobradar.locations(parent_id);

create table if not exists jobradar.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  aliases text[] not null default '{}'
);

create table if not exists jobradar.keyword_synonyms (
  term text primary key,
  synonyms text[] not null
);

-- ---------------------------------------------------------------- sources
create table if not exists jobradar.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null check (source_type in ('api', 'feed', 'manual')),
  homepage_url text,
  terms_url text,
  attribution text,
  is_enabled boolean not null default false,
  permission_status text not null default 'unverified'
    check (permission_status in ('permitted', 'awaiting_credentials', 'restricted', 'revoked', 'unverified')),
  permission_notes text,
  -- The most frequent collection the source's terms/limits allow. The
  -- effective interval is never shorter than this.
  min_interval_minutes integer not null default 30 check (min_interval_minutes >= 5),
  max_requests_per_cycle integer not null default 3 check (max_requests_per_cycle between 1 and 100),
  max_retries integer not null default 3 check (max_retries between 0 and 10),
  rate_limit_per_minute integer not null default 10 check (rate_limit_per_minute between 1 and 600),
  timeout_ms integer not null default 15000 check (timeout_ms between 1000 and 120000),
  health_status text not null default 'unknown'
    check (health_status in ('healthy', 'degraded', 'failing', 'unknown', 'disabled')),
  consecutive_failures integer not null default 0,
  last_error text,
  last_successful_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobradar.collection_schedules (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references jobradar.sources(id) on delete cascade,
  interval_minutes integer not null default 30 check (interval_minutes between 5 and 10080),
  is_enabled boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  -- overlap prevention: a schedule is claimed by setting locked_until
  locked_until timestamptz,
  locked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collection_schedules_due_idx
  on jobradar.collection_schedules(next_run_at) where is_enabled;

create table if not exists jobradar.collection_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references jobradar.sources(id) on delete cascade,
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual', 'retry')),
  scheduled_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped')),
  requests_made integer not null default 0,
  jobs_discovered integer not null default 0,
  jobs_inserted integer not null default 0,
  jobs_updated integer not null default 0,
  duplicates_detected integer not null default 0,
  subscriptions_matched integer not null default 0,
  notifications_queued integer not null default 0,
  errors jsonb not null default '[]',
  execution_metadata jsonb not null default '{}'
);
create index if not exists collection_runs_source_idx on jobradar.collection_runs(source_id, scheduled_at desc);
create index if not exists collection_runs_scheduled_idx on jobradar.collection_runs(scheduled_at desc);
-- At most one active run per source at any moment.
create unique index if not exists collection_runs_one_active_per_source
  on jobradar.collection_runs(source_id) where status in ('queued', 'running');

create table if not exists jobradar.collection_tasks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references jobradar.sources(id) on delete cascade,
  run_id uuid references jobradar.collection_runs(id) on delete set null,
  task_type text not null check (task_type in ('collect_source', 'dispatch_notifications')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  idempotency_key text not null unique,
  scheduled_at timestamptz not null default now(),
  next_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'
);
create index if not exists collection_tasks_retry_idx
  on jobradar.collection_tasks(next_attempt_at) where status = 'failed';

-- Operational timeline (observability).
create table if not exists jobradar.activity_events (
  id bigint generated always as identity primary key,
  run_id uuid references jobradar.collection_runs(id) on delete cascade,
  source_id uuid references jobradar.sources(id) on delete set null,
  scope text not null default 'collection' check (scope in ('collection', 'notification', 'system')),
  event_type text not null,
  message text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_events_created_idx on jobradar.activity_events(created_at desc);
create index if not exists activity_events_run_idx on jobradar.activity_events(run_id, id);

-- ---------------------------------------------------------------- jobs
-- array_to_string is only STABLE; text[] -> text joining is immutable in
-- practice, which generated columns require.
create or replace function jobradar.join_words(p text[])
returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(x, ' '), '') from unnest(p) x
$$;

create table if not exists jobradar.jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  fingerprint text not null unique,
  title text not null,
  company text not null,
  description text not null default '',
  short_description text not null default '',
  category_id uuid references jobradar.categories(id) on delete set null,
  location_id uuid references jobradar.locations(id) on delete set null,
  district_id uuid references jobradar.locations(id) on delete set null,
  location_text text not null default '',
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text check (salary_period in ('year', 'month', 'hour')),
  salary_text text,
  experience_min numeric,
  experience_max numeric,
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance')),
  work_mode text check (work_mode in ('remote', 'hybrid', 'onsite')),
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  apply_url text,
  status text not null default 'active' check (status in ('active', 'expired', 'hidden')),
  original_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(company, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, jobradar.join_words(skills) || ' ' || jobradar.join_words(tags)), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(location_text, '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'D')
  ) stored
);
create index if not exists jobs_search_idx on jobradar.jobs using gin(search_vector);
create index if not exists jobs_discovered_idx on jobradar.jobs(first_discovered_at desc) where status = 'active';
create index if not exists jobs_category_idx on jobradar.jobs(category_id, first_discovered_at desc);
create index if not exists jobs_location_idx on jobradar.jobs(location_id, first_discovered_at desc);
create index if not exists jobs_district_idx on jobradar.jobs(district_id);

create table if not exists jobradar.job_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobradar.jobs(id) on delete cascade,
  source_id uuid not null references jobradar.sources(id) on delete cascade,
  external_id text not null,
  source_url text not null,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists job_sources_job_idx on jobradar.job_sources(job_id);

-- ---------------------------------------------------------------- alerts
create table if not exists jobradar.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_normalized text,
  label text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'not_required')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'unsubscribed')),
  -- Management links are HMAC(app secret, id || token_salt). Only the salt is
  -- stored, so neither the database nor administrators can produce a link.
  -- Rotating the salt revokes every previously issued link.
  token_salt text not null,
  last_dispatch_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check (email is not null or verification_status = 'not_required')
);
create index if not exists alert_subscriptions_email_idx on jobradar.alert_subscriptions(email_normalized);
create index if not exists alert_subscriptions_active_idx on jobradar.alert_subscriptions(id) where status = 'active';

create table if not exists jobradar.alert_tokens (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references jobradar.alert_subscriptions(id) on delete cascade,
  purpose text not null check (purpose in ('verify_email')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alert_tokens_subscription_idx on jobradar.alert_tokens(subscription_id);

create table if not exists jobradar.alert_preferences (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null unique references jobradar.alert_subscriptions(id) on delete cascade,
  keywords text[] not null default '{}',
  keyword_query tsquery,
  category_ids uuid[] not null default '{}',
  location_ids uuid[] not null default '{}',
  include_remote boolean not null default false,
  salary_min numeric,
  salary_max numeric,
  experience_min numeric,
  experience_max numeric,
  employment_types text[] not null default '{}',
  work_modes text[] not null default '{}',
  preferred_sources text[] not null default '{}',
  notification_frequency text not null default 'instant'
    check (notification_frequency in ('instant', 'every_30_minutes', 'daily')),
  notification_channels text[] not null default '{email}',
  notify_on_updates boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alert_preferences_categories_idx on jobradar.alert_preferences using gin(category_ids);
create index if not exists alert_preferences_locations_idx on jobradar.alert_preferences using gin(location_ids);

create table if not exists jobradar.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references jobradar.alert_subscriptions(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  expiration_time timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'failed', 'revoked')),
  failure_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_sub_idx on jobradar.push_subscriptions(subscription_id) where status = 'active';

-- One row per (subscription, job, event type): the idempotency guarantee that
-- a subscriber is never told twice about the same job.
create table if not exists jobradar.notification_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references jobradar.alert_subscriptions(id) on delete cascade,
  job_id uuid not null references jobradar.jobs(id) on delete cascade,
  event_type text not null check (event_type in ('new_job_match', 'job_update_match')),
  run_id uuid references jobradar.collection_runs(id) on delete set null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, job_id, event_type)
);
create index if not exists notification_events_pending_idx
  on jobradar.notification_events(subscription_id) where dispatched_at is null;
create index if not exists notification_events_job_idx on jobradar.notification_events(job_id);

create table if not exists jobradar.notification_logs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references jobradar.alert_subscriptions(id) on delete cascade,
  job_id uuid references jobradar.jobs(id) on delete cascade,
  event_id uuid references jobradar.notification_events(id) on delete cascade,
  channel text not null check (channel in ('email', 'push', 'whatsapp')),
  kind text not null default 'job_alert' check (kind in ('job_alert', 'verification')),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'dead', 'skipped')),
  idempotency_key text not null unique,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists notification_logs_created_idx on jobradar.notification_logs(created_at desc);
create index if not exists notification_logs_retry_idx on jobradar.notification_logs(next_attempt_at) where status = 'failed';
create index if not exists notification_logs_sub_idx on jobradar.notification_logs(subscription_id);

-- ---------------------------------------------------------------- lockdown
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'jobradar' loop
    execute format('alter table jobradar.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on schema jobradar from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema jobradar from anon, authenticated';
    execute 'revoke all on all tables in schema jobradar from anon, authenticated';
    execute 'revoke all on all sequences in schema jobradar from anon, authenticated';
    execute 'revoke all on all functions in schema jobradar from anon, authenticated';
    execute 'alter default privileges in schema jobradar revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema jobradar revoke all on functions from anon, authenticated';
  end if;
end $$;
