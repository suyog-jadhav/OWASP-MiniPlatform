-- ================================================================
-- Mini CTF Platform — Indexes & Performance
-- Migration: 003_indexes.sql
-- ================================================================

-- submissions: most queried table during an event
create index idx_submissions_event_player on submissions(event_id, player_id);
create index idx_submissions_challenge on submissions(challenge_id, is_correct);
create index idx_submissions_player_challenge on submissions(player_id, challenge_id);
create index idx_submissions_submitted_at on submissions(submitted_at desc);

-- sessions: token lookup is hot path for every authenticated request
create index idx_sessions_token_hash on sessions(token_hash);
create index idx_sessions_event_player on sessions(event_player_id);

-- admin_sessions
create index idx_admin_sessions_token_hash on admin_sessions(token_hash);
create index idx_admin_sessions_admin_id on admin_sessions(admin_id);

-- event_players: frequent lookup by (event_id, player_id)
create index idx_event_players_event on event_players(event_id);
create index idx_event_players_player on event_players(player_id);

-- challenges: visible challenges per event
create index idx_challenges_event_visible on challenges(event_id, visible);

-- scoreboard_cache: ranking query
create index idx_scoreboard_event_rank on scoreboard_cache(event_id, total_points desc, last_correct_at asc);

-- announcements: latest first per event
create index idx_announcements_event on announcements(event_id, created_at desc);

-- login_attempts: rate limit + audit queries
create index idx_login_attempts_email_time on login_attempts(email, created_at desc);
create index idx_login_attempts_ip_time on login_attempts(ip, created_at desc);

-- suspicious_flags: admin dashboard filter
create index idx_suspicious_flags_event_status on suspicious_flags(event_id, status);

-- admin_audit_log: filterable by admin and action
create index idx_audit_log_admin on admin_audit_log(admin_id, created_at desc);
create index idx_audit_log_action on admin_audit_log(action, created_at desc);

-- support_tickets: inbox view
create index idx_tickets_event_status on support_tickets(event_id, status, created_at desc);
create index idx_tickets_player on support_tickets(player_id, created_at desc);
