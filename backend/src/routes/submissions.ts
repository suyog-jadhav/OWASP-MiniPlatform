import { Router, Response } from 'express';
import { z } from 'zod';
import { requirePlayerAuth, requireActiveEvent, AuthRequest } from '../middleware/auth';
import {
  submissionPerChallengeLimiter,
  submissionGlobalLimiter,
} from '../middleware/rateLimiter';
import { supabase } from '../lib/supabase';
import { checkFlag } from '../services/flagChecker';
import { refreshScoreboardForPlayer } from '../services/scoreboardCache';
import { runSuspiciousActivityChecks } from '../services/suspiciousActivity';

const router = Router();

const submitSchema = z.object({
  challenge_id: z.string().uuid(),
  value: z.string().min(1).max(512),
});

/**
 * POST /api/submissions
 *
 * Full flag submission flow per architecture spec §6.
 * Security properties:
 * - Requires active player session (auth middleware)
 * - Requires event to be active (not closed/draft)
 * - Rate limited per (player, challenge) and globally
 * - Flag comparison is server-side only, constant-time
 * - Suspicious activity checks run async (non-blocking)
 * - NEVER reveals correct flag or hints partial correctness
 */
router.post(
  '/',
  requirePlayerAuth,
  requireActiveEvent,
  submissionGlobalLimiter,
  submissionPerChallengeLimiter,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const parseResult = submitSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }

    const { challenge_id, value } = parseResult.data;
    const playerId = req.playerId!;
    const eventId = req.eventId!;
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';

    // Verify challenge belongs to this event and is visible
    const { data: challenge } = await supabase
      .from('challenges')
      .select('id, event_id, visible, points, max_attempts')
      .eq('id', challenge_id)
      .eq('event_id', eventId)
      .eq('visible', true)
      .single();

    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    // Check flag
    const result = await checkFlag(challenge_id, playerId, value);

    if (result.alreadySolved) {
      res.status(400).json({ error: 'You have already solved this challenge' });
      return;
    }

    if (result.attemptsExhausted) {
      res.status(403).json({ error: 'Maximum attempts reached for this challenge' });
      return;
    }

    const pointsAwarded = result.correct ? challenge.points : 0;

    // Insert submission (always insert, correct or not — full audit trail)
    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .insert({
        event_id: eventId,
        challenge_id,
        player_id: playerId,
        submitted_value: value,  // raw value stored for audit
        is_correct: result.correct,
        points_awarded: pointsAwarded,
        ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (subError || !submission) {
      res.status(500).json({ error: 'Failed to record submission' });
      return;
    }

    if (result.correct) {
      // Update scoreboard cache (non-blocking would miss points; we await here)
      await refreshScoreboardForPlayer(eventId, playerId);
    }

    // Async suspicious activity checks — fire and forget
    setImmediate(() => {
      runSuspiciousActivityChecks(
        submission.id,
        eventId,
        challenge_id,
        playerId,
        value,
        result.correct,
        ip
      );
    });

    // Generic responses — never hint at partial correctness
    if (result.correct) {
      res.status(200).json({
        correct: true,
        points_awarded: pointsAwarded,
        message: 'Correct! Flag accepted.',
      });
    } else {
      res.status(200).json({
        correct: false,
        points_awarded: 0,
        message: 'Incorrect flag.',
      });
    }
  }
);

export default router;
