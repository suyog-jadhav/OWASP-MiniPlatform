import { supabase } from '../lib/supabase';

const SHORT_WINDOW_MS = 5 * 60_000;    // 5 minutes
const IP_HOP_WINDOW_MS = 30 * 60_000;  // 30 minutes
const RAPID_ATTEMPT_THRESHOLD = 10;    // attempts within short window

/**
 * Run suspicious activity checks after a submission.
 * This is called asynchronously (non-blocking) after each flag submission.
 *
 * Detected signals:
 * 1. shared_flag: Same challenge + same submitted value (correct) from ≥2 distinct players
 * 2. rapid_attempts: > N incorrect submissions from one player on one challenge in window
 * 3. ip_mismatch: Same event_player, submissions from ≥3 distinct IPs in window
 */
export async function runSuspiciousActivityChecks(
  submissionId: string,
  eventId: string,
  challengeId: string,
  playerId: string,
  submittedValue: string,
  isCorrect: boolean,
  ip: string
): Promise<void> {
  try {
    await Promise.all([
      isCorrect
        ? checkSharedFlag(eventId, challengeId, submittedValue, playerId, submissionId)
        : Promise.resolve(),
      checkRapidAttempts(eventId, challengeId, playerId, submissionId),
      checkIpMismatch(eventId, playerId, ip),
    ]);
  } catch (err) {
    // Never let suspicious activity checks crash the main flow
    console.error('[SuspiciousActivity] Error in checks:', err);
  }
}

async function checkSharedFlag(
  eventId: string,
  challengeId: string,
  submittedValue: string,
  currentPlayerId: string,
  submissionId: string
): Promise<void> {
  // Find other correct submissions with the same submitted_value on this challenge
  const since = new Date(Date.now() - SHORT_WINDOW_MS).toISOString();

  const { data: others } = await supabase
    .from('submissions')
    .select('id, player_id')
    .eq('challenge_id', challengeId)
    .eq('submitted_value', submittedValue)
    .eq('is_correct', true)
    .neq('player_id', currentPlayerId)
    .gte('submitted_at', since);

  if (!others || others.length === 0) return;

  const relatedPlayerIds = [currentPlayerId, ...others.map((s) => s.player_id)];
  const relatedSubmissionIds = [submissionId, ...others.map((s) => s.id)];

  await insertSuspiciousFlag({
    eventId,
    challengeId,
    reason: 'shared_flag',
    relatedPlayerIds,
    relatedSubmissionIds,
  });
}

async function checkRapidAttempts(
  eventId: string,
  challengeId: string,
  playerId: string,
  submissionId: string
): Promise<void> {
  const since = new Date(Date.now() - SHORT_WINDOW_MS).toISOString();

  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .eq('player_id', playerId)
    .eq('is_correct', false)
    .gte('submitted_at', since);

  if ((count ?? 0) < RAPID_ATTEMPT_THRESHOLD) return;

  // Check if we've already flagged this recently (avoid duplicate flags)
  const { data: existing } = await supabase
    .from('suspicious_flags')
    .select('id')
    .eq('event_id', eventId)
    .eq('challenge_id', challengeId)
    .eq('reason', 'rapid_attempts')
    .eq('status', 'open')
    .contains('related_player_ids', [playerId])
    .limit(1)
    .single();

  if (existing) return;

  await insertSuspiciousFlag({
    eventId,
    challengeId,
    reason: 'rapid_attempts',
    relatedPlayerIds: [playerId],
    relatedSubmissionIds: [submissionId],
  });
}

async function checkIpMismatch(
  eventId: string,
  playerId: string,
  _currentIp: string
): Promise<void> {
  const since = new Date(Date.now() - IP_HOP_WINDOW_MS).toISOString();

  const { data: recentSubmissions } = await supabase
    .from('submissions')
    .select('ip, id')
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .gte('submitted_at', since)
    .not('ip', 'is', null);

  if (!recentSubmissions) return;

  const distinctIps = new Set(recentSubmissions.map((s) => s.ip).filter(Boolean));
  if (distinctIps.size < 3) return;

  // Check for existing open flag
  const { data: existing } = await supabase
    .from('suspicious_flags')
    .select('id')
    .eq('event_id', eventId)
    .eq('reason', 'ip_mismatch')
    .eq('status', 'open')
    .contains('related_player_ids', [playerId])
    .limit(1)
    .single();

  if (existing) return;

  await insertSuspiciousFlag({
    eventId,
    challengeId: null,
    reason: 'ip_mismatch',
    relatedPlayerIds: [playerId],
    relatedSubmissionIds: recentSubmissions.map((s) => s.id),
  });
}

async function insertSuspiciousFlag(opts: {
  eventId: string;
  challengeId: string | null;
  reason: string;
  relatedPlayerIds: string[];
  relatedSubmissionIds: string[];
}): Promise<void> {
  await supabase.from('suspicious_flags').insert({
    event_id: opts.eventId,
    challenge_id: opts.challengeId,
    reason: opts.reason,
    related_player_ids: opts.relatedPlayerIds,
    related_submission_ids: opts.relatedSubmissionIds,
    status: 'open',
  });
}
