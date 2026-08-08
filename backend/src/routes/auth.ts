import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { sha256, generateToken, timingSafeEqual } from '../lib/crypto';
import { loginIpLimiter, loginEmailLimiter } from '../middleware/rateLimiter';
import { requirePlayerAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  event_id: z.string().uuid(),
});

/**
 * POST /api/auth/login
 *
 * Standard player login with email + access code.
 * Returns session conflict error if a session already exists.
 * All validation failures return the same generic error to prevent enumeration.
 */
router.post(
  '/login',
  loginIpLimiter,
  loginEmailLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }

    const { email, code, event_id } = parseResult.data;
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';
    const GENERIC_ERROR = 'Invalid email or code';

    // Log the attempt (success determined at end)
    const logAttempt = async (success: boolean) => {
      await supabase.from('login_attempts').insert({
        event_id,
        email,
        ip,
        success,
      });
    };

    // 1. Look up player + event_player in one join
    const { data: player } = await supabase
      .from('players')
      .select('id, global_banned')
      .eq('email', email.toLowerCase())
      .single();

    if (!player || player.global_banned) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    const { data: eventPlayer } = await supabase
      .from('event_players')
      .select('id, code_hash, revoked, active_session_id, used_at')
      .eq('event_id', event_id)
      .eq('player_id', player.id)
      .single();

    if (!eventPlayer) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    if (eventPlayer.revoked) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    // 2. Constant-time compare sha256(code) vs stored code_hash
    const codeHash = sha256(code);
    if (!timingSafeEqual(codeHash, eventPlayer.code_hash)) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    // 3. Check for existing active session
    if (eventPlayer.active_session_id) {
      const { data: existingSession } = await supabase
        .from('sessions')
        .select('id, revoked')
        .eq('id', eventPlayer.active_session_id)
        .single();

      if (existingSession && !existingSession.revoked) {
        await logAttempt(false);
        res.status(409).json({
          error: 'session_conflict',
          message: 'You are already logged in on another device. Use force login to continue here.',
        });
        return;
      }
    }

    // 4. Issue new session
    const token = generateToken();
    const tokenHash = sha256(token);
    const now = new Date().toISOString();

    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        event_player_id: eventPlayer.id,
        token_hash: tokenHash,
        ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (sessionError || !newSession) {
      await logAttempt(false);
      res.status(500).json({ error: 'Failed to create session' });
      return;
    }

    // 5. Update event_player
    await supabase
      .from('event_players')
      .update({
        active_session_id: newSession.id,
        last_login_at: now,
        used_at: eventPlayer.used_at ?? now,
      })
      .eq('id', eventPlayer.id);

    await logAttempt(true);

    res.status(200).json({
      token,
      player_id: player.id,
      event_id,
    });
  }
);

/**
 * POST /api/auth/login/force
 *
 * Force-login: re-validates credentials, revokes existing session, issues new one.
 * Distinct logging for suspicious-activity detection (frequent force-logins = shared creds).
 */
router.post(
  '/login/force',
  loginIpLimiter,
  loginEmailLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }

    const { email, code, event_id } = parseResult.data;
    const ip = req.ip ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? '';
    const GENERIC_ERROR = 'Invalid email or code';

    const logAttempt = async (success: boolean) => {
      await supabase.from('login_attempts').insert({
        event_id,
        email,
        ip,
        success,
      });
    };

    // Same credential check as login
    const { data: player } = await supabase
      .from('players')
      .select('id, global_banned')
      .eq('email', email.toLowerCase())
      .single();

    if (!player || player.global_banned) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    const { data: eventPlayer } = await supabase
      .from('event_players')
      .select('id, code_hash, revoked, active_session_id')
      .eq('event_id', event_id)
      .eq('player_id', player.id)
      .single();

    if (!eventPlayer || eventPlayer.revoked) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    const codeHash = sha256(code);
    if (!timingSafeEqual(codeHash, eventPlayer.code_hash)) {
      await logAttempt(false);
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    // Revoke existing session if any
    if (eventPlayer.active_session_id) {
      await supabase
        .from('sessions')
        .update({ revoked: true, revoked_reason: 'force_login' })
        .eq('id', eventPlayer.active_session_id);
    }

    // Issue new session
    const token = generateToken();
    const tokenHash = sha256(token);
    const now = new Date().toISOString();

    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        event_player_id: eventPlayer.id,
        token_hash: tokenHash,
        ip,
        user_agent: userAgent,
      })
      .select('id')
      .single();

    if (sessionError || !newSession) {
      await logAttempt(false);
      res.status(500).json({ error: 'Failed to create session' });
      return;
    }

    await supabase
      .from('event_players')
      .update({
        active_session_id: newSession.id,
        last_login_at: now,
      })
      .eq('id', eventPlayer.id);

    await logAttempt(true);

    res.status(200).json({
      token,
      player_id: player.id,
      event_id,
      forced: true,
    });
  }
);

/**
 * POST /api/auth/logout
 * Revokes the current session.
 */
router.post('/logout', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.sessionId || !req.eventPlayerId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Revoke session
  await supabase
    .from('sessions')
    .update({ revoked: true, revoked_reason: 'logout' })
    .eq('id', req.sessionId);

  // Clear active_session_id
  await supabase
    .from('event_players')
    .update({ active_session_id: null })
    .eq('id', req.eventPlayerId);

  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;
