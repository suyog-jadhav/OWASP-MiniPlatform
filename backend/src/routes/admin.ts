import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { requireAdminAuth, AdminRequest, logAdminAction } from '../middleware/adminAuth';
import { sha256, generateAccessCode } from '../lib/crypto';
import { sendInviteEmail } from '../services/emailService';
import { parse as csvParse } from 'csv-parse/sync';

const router = Router();

// ── Events ────────────────────────────────────────────────────────────────────

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  scoreboard_visible: z.boolean().default(true),
});

router.get('/events', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.post('/events', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { data, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, created_by: req.adminId, status: 'draft' })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  await logAdminAction(req.adminId!, 'event.create', req.ip ?? '', { targetTable: 'events', targetId: data.id });
  res.status(201).json(data);
});

router.patch('/events/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const allowed = ['name','description','start_time','end_time','status','scoreboard_visible','scoreboard_frozen_at'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const { data, error } = await supabase
    .from('events').update(updates).eq('id', req.params.id).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  await logAdminAction(req.adminId!, 'event.update', req.ip ?? '', { targetTable: 'events', targetId: req.params.id, metadata: updates });
  res.json(data);
});

// ── Players ───────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/players/import
 * Bulk CSV import: email,name header required.
 */
router.post('/players/import', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id, csv_content, login_base_url } = req.body;
  if (!event_id || !csv_content) { res.status(400).json({ error: 'event_id and csv_content required' }); return; }

  let rows: Array<{ email: string; name?: string }>;
  try {
    rows = csvParse(csv_content, { columns: true, trim: true, skip_empty_lines: true });
  } catch {
    res.status(400).json({ error: 'Invalid CSV format. Expected columns: email, name' });
    return;
  }

  const results = { invited: 0, errors: [] as string[] };

  for (const row of rows) {
    if (!row.email) { results.errors.push(`Missing email in row`); continue; }
    try {
      // Upsert player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .upsert({ email: row.email.toLowerCase(), name: row.name ?? null }, { onConflict: 'email' })
        .select('id')
        .single();
      if (playerError || !player) { results.errors.push(`Failed to upsert player: ${row.email}`); continue; }

      // Generate access code (plaintext only used here — then discarded)
      const code = generateAccessCode();
      const codeHash = sha256(code);

      // Upsert event_player
      const { error: epError } = await supabase.from('event_players').upsert({
        event_id,
        player_id: player.id,
        code_hash: `${code}:${codeHash}`,
        invited_at: new Date().toISOString(),
      }, { onConflict: 'event_id,player_id' });
      if (epError) { results.errors.push(`Failed to register player ${row.email}`); continue; }

      // Fetch event name for email
      const { data: event } = await supabase.from('events').select('name').eq('id', event_id).single();

      // Mail service hidden - password is shown on dashboard
      /*
      await sendInviteEmail({
        to: row.email.toLowerCase(),
        playerName: row.name ?? row.email,
        eventName: event?.name ?? 'CTF Event',
        accessCode: code,
        loginUrl: `${login_base_url ?? process.env.ALLOWED_ORIGIN}?event=${event_id}`,
      });
      */

      results.invited++;
    } catch (err) {
      results.errors.push(`Error processing ${row.email}: ${String(err)}`);
    }
  }

  await logAdminAction(req.adminId!, 'players.import', req.ip ?? '', {
    targetTable: 'event_players',
    metadata: { event_id, invited: results.invited, errors: results.errors.length },
  });

  res.json(results);
});

/**
 * POST /api/admin/players/invite — single player invite
 */
router.post('/players/invite', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id, email, name, login_base_url } = req.body;
  if (!event_id || !email) { res.status(400).json({ error: 'event_id and email required' }); return; }

  const { data: player } = await supabase
    .from('players')
    .upsert({ email: email.toLowerCase(), name: name ?? null }, { onConflict: 'email' })
    .select('id').single();
  if (!player) { res.status(500).json({ error: 'Failed to upsert player' }); return; }

  const code = generateAccessCode();
  const codeHash = sha256(code);

  await supabase.from('event_players').upsert({
    event_id, player_id: player.id, code_hash: `${code}:${codeHash}`,
    invited_at: new Date().toISOString(),
  }, { onConflict: 'event_id,player_id' });

  const { data: event } = await supabase.from('events').select('name').eq('id', event_id).single();

  // Mail service hidden - password is shown on dashboard
  /*
  try {
    await sendInviteEmail({
      to: email.toLowerCase(), playerName: name ?? email,
      eventName: event?.name ?? 'CTF Event', accessCode: code,
      loginUrl: `${login_base_url ?? process.env.ALLOWED_ORIGIN}?event=${event_id}`,
    });
  } catch (emailError: any) {
    console.error('[EmailService Error]', emailError?.message || emailError);
    res.status(500).json({ error: `Failed to send invite email: ${emailError?.message || emailError}` });
    return;
  }
  */

  await logAdminAction(req.adminId!, 'player.invite', req.ip ?? '', { targetTable: 'event_players', metadata: { event_id, email } });
  res.status(201).json({ message: 'Player added' });
});

/**
 * GET /api/admin/events/:event_id/players — list players with login status
 */
router.get('/events/:event_id/players', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('event_players')
    .select(`id, code_hash, revoked, invited_at, used_at, last_login_at, active_session_id, players(id, email, name, global_banned)`)
    .eq('event_id', req.params.event_id)
    .order('invited_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }

  const mapped = (data || []).map((ep: any) => {
    let accessCode = null;
    if (ep.code_hash && ep.code_hash.includes(':')) {
      accessCode = ep.code_hash.split(':')[0];
    }
    const { code_hash, ...rest } = ep;
    return {
      ...rest,
      access_code: accessCode,
    };
  });

  res.json(mapped);
});

/**
 * POST /api/admin/players/:event_player_id/revoke
 */
router.post('/players/:event_player_id/revoke', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_player_id } = req.params;
  // Revoke access + revoke active session
  const { data: ep } = await supabase.from('event_players').select('active_session_id').eq('id', event_player_id).single();
  if (ep?.active_session_id) {
    await supabase.from('sessions').update({ revoked: true, revoked_reason: 'admin_reset' }).eq('id', ep.active_session_id);
  }
  await supabase.from('event_players').update({ revoked: true, active_session_id: null }).eq('id', event_player_id);
  await logAdminAction(req.adminId!, 'player.revoke', req.ip ?? '', { targetTable: 'event_players', targetId: event_player_id });
  res.json({ message: 'Player revoked' });
});

/**
 * POST /api/admin/players/:event_player_id/restore
 */
router.post('/players/:event_player_id/restore', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_player_id } = req.params;
  await supabase.from('event_players').update({ revoked: false }).eq('id', event_player_id);
  await logAdminAction(req.adminId!, 'player.restore', req.ip ?? '', { targetTable: 'event_players', targetId: event_player_id });
  res.json({ message: 'Player access restored' });
});

/**
 * POST /api/admin/players/:event_player_id/reset-session
 * Admin escape hatch — revoke session without needing the player's code.
 */
router.post('/players/:event_player_id/reset-session', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_player_id } = req.params;
  const { data: ep } = await supabase.from('event_players').select('active_session_id').eq('id', event_player_id).single();
  if (ep?.active_session_id) {
    await supabase.from('sessions').update({ revoked: true, revoked_reason: 'admin_reset' }).eq('id', ep.active_session_id);
  }
  await supabase.from('event_players').update({ active_session_id: null }).eq('id', event_player_id);
  await logAdminAction(req.adminId!, 'player.reset_session', req.ip ?? '', { targetTable: 'event_players', targetId: event_player_id });
  res.json({ message: 'Session reset. Player can log in again.' });
});

// ── Challenges ────────────────────────────────────────────────────────────────

router.get('/challenges', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id } = req.query;
  let query = supabase.from('challenges').select('*, categories(name), challenge_flags(flag_hash, flag_format_regex), challenge_files(*)');
  if (event_id) query = query.eq('event_id', event_id as string);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

const challengeSchema = z.object({
  event_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  points: z.number().int().positive(),
  difficulty: z.enum(['easy','medium','hard']).optional(),
  visible: z.boolean().default(false),
  max_attempts: z.number().int().positive().nullable().optional(),
  flag: z.string().min(1).optional(),
  flag_format_regex: z.string().optional(),
});

router.post('/challenges', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const parsed = challengeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { flag, flag_format_regex, ...challengeData } = parsed.data;

  const { data: challenge, error } = await supabase
    .from('challenges').insert(challengeData).select().single();
  if (error || !challenge) { res.status(500).json({ error: 'Failed to create challenge' }); return; }

  if (flag) {
    const { sha256: sha } = await import('../lib/crypto');
    await supabase.from('challenge_flags').insert({
      challenge_id: challenge.id,
      flag_hash: sha(flag.trim()),
      flag_format_regex: flag_format_regex ?? null,
    });
  }

  await logAdminAction(req.adminId!, 'challenge.create', req.ip ?? '', { targetTable: 'challenges', targetId: challenge.id });
  res.status(201).json(challenge);
});

router.patch('/challenges/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { flag, flag_format_regex, ...rest } = req.body;
  const allowed = ['title','description','points','difficulty','visible','max_attempts','category_id'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) { if (rest[k] !== undefined) updates[k] = rest[k]; }

  const { error } = await supabase.from('challenges').update(updates).eq('id', req.params.id);
  if (error) { res.status(500).json({ error: error.message }); return; }

  if (flag) {
    const { sha256: sha } = await import('../lib/crypto');
    await supabase.from('challenge_flags').upsert({
      challenge_id: req.params.id,
      flag_hash: sha(flag.trim()),
      flag_format_regex: flag_format_regex ?? null,
    }, { onConflict: 'challenge_id' });
  }

  await logAdminAction(req.adminId!, 'challenge.update', req.ip ?? '', { targetTable: 'challenges', targetId: req.params.id });
  res.json({ message: 'Challenge updated' });
});

router.delete('/challenges/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  await supabase.from('challenges').delete().eq('id', req.params.id);
  await logAdminAction(req.adminId!, 'challenge.delete', req.ip ?? '', { targetTable: 'challenges', targetId: req.params.id });
  res.json({ message: 'Challenge deleted' });
});

// ── Categories ────────────────────────────────────────────────────────────────

router.get('/categories', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id } = req.query;
  let query = supabase.from('categories').select('*');
  if (event_id) query = query.eq('event_id', event_id as string);
  const { data } = await query;
  res.json(data ?? []);
});

router.post('/categories', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id, name } = req.body;
  if (!event_id || !name) { res.status(400).json({ error: 'event_id and name required' }); return; }
  const { data, error } = await supabase.from('categories').insert({ event_id, name }).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// ── Scoreboard (admin — bypasses freeze/visibility) ────────────────────────

router.get('/scoreboard/:event_id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('scoreboard_cache')
    .select('*, players(name, email)')
    .eq('event_id', req.params.event_id)
    .order('total_points', { ascending: false })
    .order('last_correct_at', { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── Suspicious Activity ───────────────────────────────────────────────────────

router.get('/suspicious', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id, status } = req.query;
  let query = supabase.from('suspicious_flags')
    .select('*, challenges(title), events(name)')
    .eq('status', status ?? 'open')
    .order('detected_at', { ascending: false });
  if (event_id) query = query.eq('event_id', event_id as string);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch('/suspicious/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { status } = req.body;
  if (!['reviewed','dismissed','actioned'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' }); return;
  }
  await supabase.from('suspicious_flags').update({ status }).eq('id', req.params.id);
  await logAdminAction(req.adminId!, `suspicious.${status}`, req.ip ?? '', { targetId: req.params.id });
  res.json({ message: 'Updated' });
});

// ── Audit Log ─────────────────────────────────────────────────────────────────

router.get('/audit', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { admin_id, action, limit = '50', offset = '0' } = req.query;
  let query = supabase.from('admin_audit_log')
    .select('*, admins(email)')
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (admin_id) query = query.eq('admin_id', admin_id as string);
  if (action) query = query.ilike('action', `%${action}%`);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── Announcements ─────────────────────────────────────────────────────────────

router.post('/announcements', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id, message } = req.body;
  if (!event_id || !message) { res.status(400).json({ error: 'event_id and message required' }); return; }
  const { data, error } = await supabase.from('announcements')
    .insert({ event_id, message, created_by: req.adminId })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  await logAdminAction(req.adminId!, 'announcement.create', req.ip ?? '', { targetId: data.id });
  res.status(201).json(data);
});

router.get('/announcements/:event_id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, message, created_at')
    .eq('event_id', req.params.event_id)
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch('/announcements/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message) { res.status(400).json({ error: 'message is required' }); return; }

  const { data, error } = await supabase.from('announcements')
    .update({ message })
    .eq('id', id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  await logAdminAction(req.adminId!, 'announcement.update', req.ip ?? '', { targetId: id, metadata: { message } });
  res.json(data);
});

router.delete('/announcements/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { error } = await supabase.from('announcements')
    .delete()
    .eq('id', id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  await logAdminAction(req.adminId!, 'announcement.delete', req.ip ?? '', { targetId: id });
  res.json({ message: 'Announcement deleted' });
});

// ── Support Tickets ───────────────────────────────────────────────────────────

router.get('/support/tickets', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { event_id, status } = req.query;
  let query = supabase.from('support_tickets')
    .select('*, players(name, email), ticket_replies(*)')
    .order('created_at', { ascending: false });
  if (event_id) query = query.eq('event_id', event_id as string);
  if (status) query = query.eq('status', status as string);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch('/support/tickets/:id', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { status } = req.body;
  const updates: Record<string, unknown> = { status };
  if (status === 'closed') updates.resolved_at = new Date().toISOString();
  await supabase.from('support_tickets').update(updates).eq('id', req.params.id);
  res.json({ message: 'Ticket updated' });
});

router.post('/support/tickets/:id/reply', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const { message } = req.body;
  if (!message) { res.status(400).json({ error: 'message required' }); return; }
  const { data, error } = await supabase.from('ticket_replies')
    .insert({ ticket_id: req.params.id, sender_type: 'admin', message })
    .select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  // Auto-move ticket to in_progress when admin replies
  await supabase.from('support_tickets').update({ status: 'in_progress' }).eq('id', req.params.id).eq('status', 'open');
  res.status(201).json(data);
});

export default router;
