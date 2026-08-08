import { sha256, normalizeFlag, timingSafeEqual } from '../lib/crypto';
import { supabase } from '../lib/supabase';

interface FlagCheckResult {
  correct: boolean;
  alreadySolved: boolean;
  attemptsExhausted: boolean;
}

/**
 * Check a submitted flag value against the stored hash for a challenge.
 *
 * Security properties:
 * - Normalizes input (trim only — case-sensitive per spec)
 * - SHA-256 hashed before comparison
 * - Constant-time comparison using timingSafeEqual to prevent timing attacks
 * - challenge_flags table is NEVER exposed to the client; this runs server-side only
 */
export async function checkFlag(
  challengeId: string,
  playerId: string,
  submittedValue: string
): Promise<FlagCheckResult> {
  // Check if already solved
  const { data: existingSolve } = await supabase
    .from('submissions')
    .select('id')
    .eq('challenge_id', challengeId)
    .eq('player_id', playerId)
    .eq('is_correct', true)
    .limit(1)
    .single();

  if (existingSolve) {
    return { correct: false, alreadySolved: true, attemptsExhausted: false };
  }

  // Get flag hash and max_attempts
  const { data: challengeData } = await supabase
    .from('challenges')
    .select('max_attempts, challenge_flags(flag_hash)')
    .eq('id', challengeId)
    .single();

  if (!challengeData) {
    return { correct: false, alreadySolved: false, attemptsExhausted: false };
  }

  const flagData = (challengeData as any).challenge_flags;
  if (!flagData) {
    return { correct: false, alreadySolved: false, attemptsExhausted: false };
  }

  // Check attempt count if max_attempts is set
  if (challengeData.max_attempts !== null && challengeData.max_attempts !== undefined) {
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challengeId)
      .eq('player_id', playerId);

    if ((count ?? 0) >= challengeData.max_attempts) {
      return { correct: false, alreadySolved: false, attemptsExhausted: true };
    }
  }

  // Normalize and hash the submitted value
  const normalized = normalizeFlag(submittedValue);
  const submittedHash = sha256(normalized);

  // Constant-time comparison
  const correct = timingSafeEqual(submittedHash, flagData.flag_hash);

  return { correct, alreadySolved: false, attemptsExhausted: false };
}
