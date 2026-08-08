import { supabase } from '../lib/supabase';

/**
 * Recomputes the scoreboard cache entry for a specific player in an event.
 * Called immediately after a correct submission — no cron needed at this scale.
 */
export async function refreshScoreboardForPlayer(
  eventId: string,
  playerId: string
): Promise<void> {
  // Aggregate this player's correct submissions for the event
  const { data: submissions } = await supabase
    .from('submissions')
    .select('points_awarded, submitted_at')
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .eq('is_correct', true)
    .order('submitted_at', { ascending: true });

  if (!submissions) return;

  const totalPoints = submissions.reduce((sum, s) => sum + (s.points_awarded ?? 0), 0);
  const challengesSolved = submissions.length;
  const lastCorrectAt = submissions[submissions.length - 1]?.submitted_at ?? null;

  // Upsert into scoreboard_cache
  await supabase.from('scoreboard_cache').upsert(
    {
      event_id: eventId,
      player_id: playerId,
      total_points: totalPoints,
      challenges_solved: challengesSolved,
      last_correct_at: lastCorrectAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,player_id' }
  );
}
