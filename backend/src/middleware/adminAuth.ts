import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { sha256 } from '../lib/crypto';

export interface AdminRequest extends Request {
  adminId?: string;
}

/**
 * Admin session validation middleware.
 * Admin sessions are entirely separate from player sessions.
 * They have a configurable TTL (default 4 hours) and are stored
 * in the admin_sessions table.
 */
export async function requireAdminAuth(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from('admin_sessions')
    .select('id, admin_id, revoked, expires_at, last_seen_at')
    .eq('token_hash', tokenHash)
    .single();

  if (error || !session) {
    res.status(401).json({ error: 'Invalid or expired admin session' });
    return;
  }

  if (session.revoked) {
    res.status(401).json({ error: 'Admin session has been revoked' });
    return;
  }

  if (session.expires_at < now) {
    // Revoke expired session
    await supabase
      .from('admin_sessions')
      .update({ revoked: true, revoked_reason: 'expired' })
      .eq('id', session.id);
    res.status(401).json({ error: 'Admin session has expired' });
    return;
  }

  req.adminId = session.admin_id;

  // Throttled last_seen_at update
  const lastSeen = new Date(session.last_seen_at).getTime();
  if (Date.now() - lastSeen > 60_000) {
    supabase
      .from('admin_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id)
      .then(() => {});
  }

  next();
}

/**
 * Log an admin action to the audit log.
 * Call this after every admin mutation.
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  ip: string,
  options?: {
    targetTable?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_table: options?.targetTable,
    target_id: options?.targetId,
    metadata: options?.metadata,
    ip,
  });
}
