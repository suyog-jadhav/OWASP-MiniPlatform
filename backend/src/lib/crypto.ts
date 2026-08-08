import crypto from 'crypto';
import argon2 from 'argon2';

/**
 * Compute SHA-256 hash of a string, returning hex digest.
 * Used for: access code hashing, session token hashing.
 * NOT used for admin passwords (use hashPassword/verifyPassword for those).
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Timing-safe comparison of two hex strings.
 * Used when comparing sha256(submitted_value) vs stored flag_hash.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still execute comparison to prevent timing oracle on length
    crypto.timingSafeEqual(Buffer.from(a.padEnd(64, '0')), Buffer.from(b.padEnd(64, '0')));
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random session token.
 * Returns: 256-bit random token as a 64-char hex string.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random nanoid-style access code for player invites.
 * Uses URL-safe alphabet to avoid ambiguous characters.
 */
export function generateAccessCode(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

/**
 * Hash an admin password using argon2id.
 * argon2id is the recommended variant for password hashing (resistant to
 * both side-channel and GPU attacks).
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,    // 64 MiB
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verify an admin password against an argon2id hash.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Normalize a flag submission before hashing.
 * - Trim leading/trailing whitespace
 * - Do NOT change case (flags are case-sensitive)
 */
export function normalizeFlag(value: string): string {
  return value.trim();
}
