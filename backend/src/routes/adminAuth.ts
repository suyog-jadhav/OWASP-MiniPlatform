import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import {
  sha256,
  generateToken,
  hashPassword,
  verifyPassword,
} from '../lib/crypto';
import { adminLoginLimiter } from '../middleware/rateLimiter';
import { requireAdminAuth, AdminRequest, logAdminAction } from '../middleware/adminAuth';

const router = Router();

const ADMIN_SESSION_TTL_HOURS = 4;

// ── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

// ── Helper ───────────────────────────────────────────────────────────────────

function adminSessionExpiresAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + ADMIN_SESSION_TTL_HOURS);
  return d.toISOString();
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/auth/login
 *
 * Email + argon2id password verification.
 * Rate limit: 5 / 15 min per IP (strictest in the system).
 */
router.post(
  '/login',
  adminLoginLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }

    const { email, password } = parseResult.data;
    const ip = req.ip ?? 'unknown';
    const GENERIC_ERROR = 'Invalid credentials';

    const { data: admin } = await supabase
      .from('admins')
      .select('id, password_hash')
      .eq('email', email.toLowerCase())
      .single();

    if (!admin) {
      // Still run a dummy comparison to prevent timing oracle
      await hashPassword('dummy-comparison-password');
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    const passwordOk = await verifyPassword(admin.password_hash, password);
    if (!passwordOk) {
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    // Issue admin session
    const token = generateToken();
    const tokenHash = sha256(token);
    const expiresAt = adminSessionExpiresAt();

    const { error: sessionError } = await supabase.from('admin_sessions').insert({
      admin_id: admin.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip,
      user_agent: req.headers['user-agent'] ?? '',
    });

    if (sessionError) {
      res.status(500).json({ error: 'Failed to create admin session' });
      return;
    }

    await logAdminAction(admin.id, 'admin.login', ip);

    res.status(200).json({ token, expires_at: expiresAt });
  }
);

/**
 * POST /api/admin/auth/logout
 */
router.post('/logout', requireAdminAuth, async (req: AdminRequest, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization!;
  const token = authHeader.slice(7);
  const tokenHash = sha256(token);

  await supabase
    .from('admin_sessions')
    .update({ revoked: true, revoked_reason: 'logout' })
    .eq('token_hash', tokenHash);

  res.status(200).json({ message: 'Admin logged out' });
});

/**
 * POST /api/admin/auth/create
 *
 * Create the initial admin account. Should be restricted to internal use only.
 * In production: protect this endpoint or remove it post-setup.
 */
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  // Only allow this in development or when no admins exist
  const { count } = await supabase
    .from('admins')
    .select('*', { count: 'exact', head: true });

  if (process.env.NODE_ENV === 'production' && (count ?? 0) > 0) {
    res.status(403).json({ error: 'Admin creation is disabled in production' });
    return;
  }

  const parseResult = createAdminSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Password must be at least 12 characters' });
    return;
  }

  const { email, password } = parseResult.data;
  const passwordHash = await hashPassword(password);

  const { data: admin, error } = await supabase
    .from('admins')
    .insert({ email: email.toLowerCase(), password_hash: passwordHash })
    .select('id, email')
    .single();

  if (error) {
    res.status(500).json({ error: 'Failed to create admin' });
    return;
  }

  res.status(201).json({
    admin,
    next_step: 'Admin account created successfully.',
  });
});

export default router;
