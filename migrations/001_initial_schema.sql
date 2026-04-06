-- Deliberation: Initial Schema (Neon / Vercel Postgres)
-- Adapted from supabase/migrations/001_initial_schema.sql
-- Changes: removed RLS policies, made storage_path nullable

-- Saved configuration presets
create table presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null,
  created_at timestamptz default now()
);

-- A deliberation session
create table sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  status text not null default 'configuring',
  config jsonb not null,
  briefing_text text,
  briefing_urls text[],
  chain_parent_id uuid references sessions(id),
  tags text[],
  total_cost_cents integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- File attachments for briefings
create table session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  storage_path text,  -- nullable: binary storage is optional
  extracted_text text,
  created_at timestamptz default now()
);

-- Panelist configurations per session
create table panelists (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  display_name text not null,
  model_id text not null,
  system_prompt text,
  avatar_color text,
  is_human boolean default false,
  sort_order integer not null,
  created_at timestamptz default now()
);

-- Rounds within a session
create table rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  phase text not null,
  round_number integer not null,
  created_at timestamptz default now()
);

-- Individual model contributions
create table contributions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  panelist_id uuid references panelists(id) on delete cascade,
  content text not null,
  thinking_content text,
  token_usage jsonb,
  cost_cents integer,
  vote_data jsonb,
  drafter_vote text,
  meta jsonb,
  created_at timestamptz default now()
);

-- User interventions
create table interventions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  type text not null,
  content text,
  applied_before_round integer,
  created_at timestamptz default now()
);

-- Final resolution documents
create table resolutions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  version integer not null default 1,
  drafter_panelist_id uuid references panelists(id),
  draft_type text not null default 'elected',
  content_markdown text not null,
  pdf_storage_path text,  -- nullable, reserved for future use
  status text not null default 'draft',
  created_at timestamptz default now()
);

-- Cost tracking
create table cost_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  panelist_id uuid references panelists(id),
  phase text not null,
  round_number integer,
  model_id text not null,
  input_tokens integer,
  output_tokens integer,
  thinking_tokens integer,
  cached_tokens integer,
  cost_cents integer,
  created_at timestamptz default now()
);

-- updated_at trigger for sessions
create or replace function update_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger sessions_updated_at
  before update on sessions
  for each row execute function update_updated_at();

-- Indexes
create index idx_sessions_status on sessions(status);
create index idx_sessions_created_at on sessions(created_at desc);
create index idx_session_files_session_id on session_files(session_id);
create index idx_panelists_session_id on panelists(session_id);
create index idx_rounds_session_id on rounds(session_id);
create index idx_contributions_round_id on contributions(round_id);
create index idx_interventions_session_id on interventions(session_id);
create index idx_resolutions_session_id on resolutions(session_id);
create index idx_cost_log_session_id on cost_log(session_id);
