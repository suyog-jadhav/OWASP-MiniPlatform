import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// Configure time tolerance to 2 steps (±60s) to absorb clock drift between client and server
authenticator.options = { window: 2 };
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
  totp_code: z.string().length(6).optional(),
});

const setupTotpVerifySchema = z.object({
  totp_code: z.string().length(6),
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
 * Email + argon2id password verification, followed by TOTP check if enabled.
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

    const { email, password, totp_code } = parseResult.data;
    const ip = req.ip ?? 'unknown';
    const GENERIC_ERROR = 'Invalid credentials';

    const { data: admin } = await supabase
      .from('admins')
      .select('id, password_hash, totp_secret, totp_enabled')
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

    // TOTP is mandatory — if not yet enabled, force setup
    if (!admin.totp_enabled || !admin.totp_secret) {
      res.status(403).json({
        error: 'totp_setup_required',
        message: 'Please complete TOTP 2FA setup before logging in.',
        admin_id: admin.id,
      });
      return;
    }

    // Verify TOTP code
    if (!totp_code) {
      res.status(400).json({ error: 'TOTP code required' });
      return;
    }

    const totpValid = authenticator.verify({
      token: totp_code,
      secret: admin.totp_secret,
    });

    if (!totpValid) {
      res.status(401).json({ error: 'Invalid TOTP code' });
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
 * POST /api/admin/auth/setup-totp
 *
 * First-time TOTP setup. Generates a secret and QR code.
 * Only usable when totp_enabled = false.
 * Requires valid password proof (not a full session, to allow pre-2FA setup).
 */
router.post('/setup-totp', async (req: Request, res: Response): Promise<void> => {
  const { admin_id, password } = req.body;

  if (!admin_id || !password) {
    res.status(400).json({ error: 'admin_id and password are required' });
    return;
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id, email, password_hash, totp_enabled')
    .eq('id', admin_id)
    .single();

  if (!admin) {
    res.status(404).json({ error: 'Admin not found' });
    return;
  }

  if (admin.totp_enabled) {
    res.status(400).json({ error: 'TOTP is already configured' });
    return;
  }

  const passwordOk = await verifyPassword(admin.password_hash, password);
  if (!passwordOk) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  // Generate TOTP secret
  const secret = authenticator.generateSecret();
  const otpAuthUrl = authenticator.keyuri(admin.email, 'CTF Platform', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  // Store the secret (not yet enabled — enabled after verify)
  await supabase.from('admins').update({ totp_secret: secret }).eq('id', admin.id);

  res.status(200).json({
    secret,
    qr_code: qrCodeDataUrl,
    message: 'Scan the QR code with your authenticator app, then call /verify-totp to enable.',
  });
});

/**
 * POST /api/admin/auth/verify-totp
 *
 * Confirms TOTP setup by verifying a code. Enables TOTP on the admin account.
 */
router.post('/verify-totp', async (req: Request, res: Response): Promise<void> => {
  const parseResult = setupTotpVerifySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const { totp_code } = parseResult.data;
  const { admin_id } = req.body;

  if (!admin_id) {
    res.status(400).json({ error: 'admin_id is required' });
    return;
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id, totp_secret, totp_enabled')
    .eq('id', admin_id)
    .single();

  if (!admin || !admin.totp_secret) {
    res.status(400).json({ error: 'TOTP not yet set up. Call /setup-totp first.' });
    return;
  }

  const valid = authenticator.verify({ token: totp_code, secret: admin.totp_secret });
  if (!valid) {
    res.status(401).json({ error: 'Invalid TOTP code' });
    return;
  }

  await supabase.from('admins').update({ totp_enabled: true }).eq('id', admin.id);

  res.status(200).json({ message: 'TOTP 2FA enabled successfully' });
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
    next_step: 'Call /api/admin/auth/setup-totp to configure TOTP 2FA (mandatory)',
  });
});

export default router;
