import { Router, Response } from 'express';
import { requirePlayerAuth, AuthRequest } from '../middleware/auth';
import { ticketCreationLimiter } from '../middleware/rateLimiter';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * GET /api/challenges — list visible challenges for the player's event
 */
router.get('/challenges', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('challenges_public')
    .select('*')
    .eq('event_id', req.eventId!);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/**
 * GET /api/challenges/:id/file/:file_id
 * Generate a short-lived signed URL for a challenge file attachment.
 * Checks player is enrolled + event active + challenge visible before issuing.
 */
router.get('/challenges/:id/file/:file_id', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: challenge_id, file_id } = req.params;

  // Verify challenge is in the player's event and is visible
  const { data: challenge } = await supabase
    .from('challenges')
    .select('id, visible, event_id')
    .eq('id', challenge_id)
    .eq('event_id', req.eventId!)
    .eq('visible', true)
    .single();

  if (!challenge) { res.status(404).json({ error: 'Challenge not found' }); return; }

  // Get the file record
  const { data: file } = await supabase
    .from('challenge_files')
    .select('*')
    .eq('id', file_id)
    .eq('challenge_id', challenge_id)
    .single();

  if (!file) { res.status(404).json({ error: 'File not found' }); return; }

  if (file.file_type === 'url') {
    res.json({ url: file.external_url, type: 'url', label: file.label });
    return;
  }

  if (!file.storage_path) { res.status(404).json({ error: 'File not available' }); return; }

  // Generate a 5-minute signed URL
  const { data: signed, error } = await supabase.storage
    .from('challenge-files')
    .createSignedUrl(file.storage_path, 300);  // 300 seconds = 5 minutes

  if (error || !signed) { res.status(500).json({ error: 'Failed to generate download URL' }); return; }

  res.json({ url: signed.signedUrl, type: file.file_type, label: file.label });
});

/**
 * GET /api/scoreboard/:event_id — public scoreboard (respects freeze + visibility)
 */
router.get('/scoreboard/:event_id', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { event_id } = req.params;

  const { data: event } = await supabase
    .from('events')
    .select('scoreboard_visible, scoreboard_frozen_at, status')
    .eq('id', event_id)
    .single();

  if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
  if (!event.scoreboard_visible) { res.status(403).json({ error: 'Scoreboard is currently hidden' }); return; }

  let query = supabase
    .from('scoreboard_cache')
    .select('player_id, total_points, challenges_solved, last_correct_at, updated_at, players(name)')
    .eq('event_id', event_id)
    .order('total_points', { ascending: false })
    .order('last_correct_at', { ascending: true });

  // If frozen, serve the snapshot as of freeze time
  if (event.scoreboard_frozen_at) {
    query = query.lte('updated_at', event.scoreboard_frozen_at);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ frozen: !!event.scoreboard_frozen_at, frozen_at: event.scoreboard_frozen_at, scores: data });
});

/**
 * GET /api/announcements/:event_id
 */
router.get('/announcements/:event_id', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, message, created_at')
    .eq('event_id', req.params.event_id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/**
 * GET /api/support/tickets — player's own tickets
 */
router.get('/support/tickets', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, ticket_replies(*)')
    .eq('player_id', req.playerId!)
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

/**
 * POST /api/support/tickets — create a support ticket
 */
router.post('/support/tickets', requirePlayerAuth, ticketCreationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const { event_id, subject, message } = req.body;
  if (!event_id || !subject || !message) {
    res.status(400).json({ error: 'event_id, subject, and message are required' }); return;
  }
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ event_id, player_id: req.playerId!, subject, message })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

/**
 * POST /api/support/tickets/:id/reply — player reply to own ticket
 */
router.post('/support/tickets/:id/reply', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { message } = req.body;
  if (!message) { res.status(400).json({ error: 'message required' }); return; }

  // Verify player owns this ticket
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('player_id, status')
    .eq('id', req.params.id)
    .single();
  if (!ticket || ticket.player_id !== req.playerId) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }
  if (ticket.status === 'closed') {
    res.status(400).json({ error: 'Cannot reply to a closed ticket' }); return;
  }

  const { data, error } = await supabase.from('ticket_replies')
    .insert({ ticket_id: req.params.id, sender_type: 'player', message })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

/**
 * POST /api/challenge-reactions — add/update a reaction on a challenge
 */
router.post('/challenge-reactions', requirePlayerAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { challenge_id, reaction } = req.body;
  if (!challenge_id || !['like','dislike'].includes(reaction)) {
    res.status(400).json({ error: 'challenge_id and reaction (like|dislike) required' }); return;
  }
  const { data, error } = await supabase.from('challenge_reactions').upsert({
    challenge_id, player_id: req.playerId!, reaction,
  }, { onConflict: 'challenge_id,player_id' }).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
