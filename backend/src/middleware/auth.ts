import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { sha256 } from '../lib/crypto';

export interface AuthRequest extends Request {
  playerId?: string;
  eventId?: string;
  eventPlayerId?: string;
  sessionId?: string;
}

/**
 * Player session validation middleware.
 * Validates the Bearer token, checks it's the active session,
 * attaches player context to the request.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Hash it with SHA-256
 *   3. Look up session by token_hash
 *   4. Reject if revoked OR if session.id !== event_players.active_session_id
 *   5. Attach context: { playerId, eventId, eventPlayerId, sessionId }
 *   6. Throttled last_seen_at update (max once every 60s)
 */
export async function requirePlayerAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const tokenHash = sha256(token);

  // Fetch session + event_player in one query
  const { data: session, error } = await supabase
    .from('sessions')
    .select(`
      id,
      revoked,
      last_seen_at,
      event_player_id,
      event_players!sessions_event_player_id_fkey!inner (
        id,
        player_id,
        event_id,
        revoked,
        active_session_id,
        events!inner (
          status
        )
      )
    `)
    .eq('token_hash', tokenHash)
    .single();

  if (error || !session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  // Check session is not revoked
  if (session.revoked) {
    res.status(401).json({ error: 'Session has been revoked' });
    return;
  }

  const ep = session.event_players as any;

  // Check this is still the active session
  if (ep.active_session_id !== session.id) {
    res.status(401).json({ error: 'Session superseded by a newer login' });
    return;
  }

  // Check player is not revoked
  if (ep.revoked) {
    res.status(403).json({ error: 'Your access to this event has been revoked' });
    return;
  }

  // Attach request context
  req.playerId = ep.player_id;
  req.eventId = ep.event_id;
  req.eventPlayerId = ep.id;
  req.sessionId = session.id;

  // Throttled last_seen_at update (only if >60s since last update)
  const lastSeen = new Date(session.last_seen_at).getTime();
  const now = Date.now();
  if (now - lastSeen > 60_000) {
    // Fire-and-forget, don't await
    supabase
      .from('sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id)
      .then(() => {});
  }

  next();
}

/**
 * Middleware that additionally requires the event to be active.
 * Use on routes that should be blocked when event is closed.
 */
export async function requireActiveEvent(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Must run after requirePlayerAuth
  if (!req.eventId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', req.eventId)
    .single();

  if (!event || event.status !== 'active') {
    res.status(403).json({ error: 'Event is not currently active' });
    return;
  }

  next();
}
