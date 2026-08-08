-- ================================================================
-- Mini CTF Platform — RLS Policies & GRANTs
-- Migration: 002_rls_policies.sql
-- ================================================================

-- ============ ENABLE RLS ON ALL TABLES ============

alter table players enable row level security;
alter table admins enable row level security;
alter table events enable row level security;
alter table event_players enable row level security;
alter table sessions enable row level security;
alter table admin_sessions enable row level security;
alter table categories enable row level security;
alter table challenges enable row level security;
alter table challenge_flags enable row level security;
alter table challenge_files enable row level security;
alter table challenge_reactions enable row level security;
alter table submissions enable row level security;
alter table scoreboard_cache enable row level security;
alter table announcements enable row level security;
alter table support_tickets enable row level security;
alter table ticket_replies enable row level security;
alter table admin_audit_log enable row level security;
alter table suspicious_flags enable row level security;
alter table login_attempts enable row level security;

-- ============ EXPLICIT GRANT REVOCATIONS (Defense in Depth) ============
-- These tables MUST never be accessible to the anon role, enforced at GRANT level.

revoke all on challenge_flags from anon;
revoke all on event_players from anon;
revoke all on sessions from anon;
revoke all on admin_sessions from anon;
revoke all on submissions from anon;
revoke all on login_attempts from anon;
revoke all on admin_audit_log from anon;
revoke all on suspicious_flags from anon;
revoke all on admins from anon;

-- ============ PUBLIC EVENTS VIEW ============
-- Only expose safe public columns (no internal config)

create or replace view public.events_public as
  select
    id,
    name,
    description,
    start_time,
    end_time,
    status,
    scoreboard_visible,
    scoreboard_frozen_at,
    created_at
  from events
  where status in ('active', 'closed');

-- Grant anon read on the view
grant select on public.events_public to anon;

-- ============ CHALLENGES PUBLIC VIEW ============
-- Joins challenges + files, NEVER includes challenge_flags

create or replace view public.challenges_public as
  select
    c.id,
    c.event_id,
    c.category_id,
    cat.name as category_name,
    c.title,
    c.description,
    c.points,
    c.difficulty,
    c.visible,
    c.max_attempts,
    c.created_at,
    coalesce(
      json_agg(
        json_build_object(
          'id', cf.id,
          'file_type', cf.file_type,
          'label', cf.label,
          'external_url', cf.external_url
          -- Note: storage_path is NOT included; clients get signed URLs via API
        )
      ) filter (where cf.id is not null),
      '[]'
    ) as files
  from challenges c
  left join categories cat on cat.id = c.category_id
  left join challenge_files cf on cf.challenge_id = c.id
  where c.visible = true
  group by c.id, cat.name;

-- Grant anon read on the view
grant select on public.challenges_public to anon;

-- ============ SCOREBOARD CACHE (Public readable) ============

create policy "Scoreboard readable by anyone"
  on scoreboard_cache for select
  using (
    exists (
      select 1 from events e
      where e.id = scoreboard_cache.event_id
        and e.scoreboard_visible = true
        and e.status in ('active','closed')
    )
  );

grant select on scoreboard_cache to anon;

-- ============ ANNOUNCEMENTS (Public readable for active events) ============

create policy "Announcements readable for active events"
  on announcements for select
  using (
    exists (
      select 1 from events e
      where e.id = announcements.event_id
        and e.status in ('active', 'closed')
    )
  );

grant select on announcements to anon;

-- ============ CATEGORIES (Public readable) ============

create policy "Categories readable for active events"
  on categories for select
  using (
    exists (
      select 1 from events e
      where e.id = categories.event_id
        and e.status in ('active','closed')
    )
  );

grant select on categories to anon;

-- NOTE: challenge_reactions would be writable by authenticated players via the Node API
-- using the service role key; no direct client writes to this table via anon key.
-- RLS policies here are for reference only.

create policy "Players can read their own reactions"
  on challenge_reactions for select
  using (true); -- Node API mediates all writes; anon reads are ok for public reaction counts

grant select on challenge_reactions to anon;

-- ============ RESTRICT service_role to bypass RLS (default behavior) ============
-- The Node API uses the service_role key which bypasses RLS by default in Supabase.
-- This is intentional and correct — all writes are mediated by the Node API.

-- ============ REALTIME PUBLICATIONS ============
-- Enable Realtime for scoreboard and announcements

alter publication supabase_realtime add table scoreboard_cache;
alter publication supabase_realtime add table announcements;
