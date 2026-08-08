-- ================================================================
-- Mini CTF Platform — Core Schema
-- Migration: 001_core_schema.sql
-- ================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============ CORE IDENTITY ============

create table players (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamptz default now(),
  global_banned boolean default false
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,        -- argon2id
  totp_secret text,                   -- for 2FA (encrypted at app level)
  totp_enabled boolean default false,
  created_at timestamptz default now()
);

-- ============ EVENTS ============

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'draft'
      check (status in ('draft','active','closed')),
  scoreboard_visible boolean default true,
  scoreboard_frozen_at timestamptz,   -- null = not frozen
  created_by uuid references admins(id),
  created_at timestamptz default now()
);

-- Per-event allowlist + per-player access code
create table event_players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  code_hash text not null,            -- sha256(code), plaintext only ever in invite email
  invited_at timestamptz,
  used_at timestamptz,                -- first successful login
  last_login_at timestamptz,
  revoked boolean default false,
  active_session_id uuid,             -- FK added after sessions table
  unique (event_id, player_id)
);

-- ============ SESSIONS ============

create table sessions (
  id uuid primary key default gen_random_uuid(),
  event_player_id uuid references event_players(id) on delete cascade,
  token_hash text not null unique,    -- sha256 of the bearer token
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  ip text,
  user_agent text,
  revoked boolean default false,
  revoked_reason text                 -- 'logout' | 'force_login' | 'admin_reset' | 'event_closed'
);

-- Now add the FK from event_players to sessions
alter table event_players
  add constraint fk_active_session
  foreign key (active_session_id) references sessions(id);

-- Admin sessions (separate from player sessions, shorter TTL)
create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  revoked boolean default false,
  revoked_reason text
);

-- ============ CHALLENGES ============

create table categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  unique (event_id, name)
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  category_id uuid references categories(id),
  title text not null,
  description text,
  points integer not null default 100,
  difficulty text check (difficulty in ('easy','medium','hard')),
  visible boolean default true,
  max_attempts integer,              -- null = unlimited
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Flags kept in a SEPARATE table, never joined into any client-facing view
create table challenge_flags (
  challenge_id uuid primary key references challenges(id) on delete cascade,
  flag_hash text not null,           -- sha256(normalized flag)
  flag_format_regex text             -- e.g. '^CTF\{.+\}$' for client-side hint only
);

create table challenge_files (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id) on delete cascade,
  file_type text check (file_type in ('file','url','image')),
  storage_path text,                 -- Supabase Storage path (for file/image)
  external_url text,                 -- for type = 'url'
  label text,
  created_at timestamptz default now()
);

create table challenge_reactions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  reaction text check (reaction in ('like','dislike')),
  created_at timestamptz default now(),
  unique (challenge_id, player_id)
);

-- ============ SUBMISSIONS ============

create table submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id),
  challenge_id uuid references challenges(id),
  player_id uuid references players(id),
  submitted_value text not null,     -- raw text submitted (never store correct flag alongside)
  is_correct boolean not null,
  points_awarded integer default 0,
  ip text,
  user_agent text,
  submitted_at timestamptz default now()
);

-- ============ SCOREBOARD CACHE ============

create table scoreboard_cache (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  total_points integer not null default 0,
  challenges_solved integer not null default 0,
  last_correct_at timestamptz,
  updated_at timestamptz default now(),
  unique (event_id, player_id)
);

-- ============ ANNOUNCEMENTS / SUPPORT ============

create table announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  message text not null,
  created_by uuid references admins(id),
  created_at timestamptz default now()
);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id),
  player_id uuid references players(id),
  subject text,
  message text,
  status text default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references support_tickets(id) on delete cascade,
  sender_type text check (sender_type in ('player','admin')),
  message text,
  created_at timestamptz default now()
);

-- ============ AUDIT & SECURITY ============

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id),
  action text not null,               -- 'challenge.create', 'player.revoke', etc.
  target_table text,
  target_id uuid,
  metadata jsonb,
  ip text,
  created_at timestamptz default now()
);

create table suspicious_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id),
  challenge_id uuid references challenges(id),
  reason text not null,               -- 'shared_flag' | 'rapid_attempts' | 'ip_mismatch' | 'zero_time_solve'
  related_player_ids uuid[],
  related_submission_ids uuid[],
  detected_at timestamptz default now(),
  status text default 'open' check (status in ('open','reviewed','dismissed','actioned'))
);

create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  email text,
  ip text,
  success boolean,
  created_at timestamptz default now()
);
