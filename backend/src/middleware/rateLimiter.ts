import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV === 'development';

const dummyMiddleware = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};

const standardResponse = (_req: Request, res: Response) => {
  res.status(429).json({
    error: 'Too many requests. Please try again later.',
  });
};

/**
 * Global IP backstop — coarse rate limit applied to ALL routes.
 * 100 requests per minute per IP.
 */
export const globalLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 60_000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      handler: standardResponse,
    });

/**
 * Player login + force-login endpoint.
 * 5 attempts per 10 minutes per IP.
 */
export const loginIpLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 10 * 60_000,
      max: 5,
      keyGenerator: (req) => req.ip ?? 'unknown',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'Too many login attempts from this IP. Please try again in 10 minutes.',
        });
      },
    });

/**
 * Player login — per email address.
 * 5 attempts per 10 minutes per email.
 */
export const loginEmailLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 10 * 60_000,
      max: 5,
      keyGenerator: (req) => (req.body?.email ?? 'unknown').toLowerCase(),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'Too many login attempts for this email. Please try again in 10 minutes.',
        });
      },
    });

/**
 * Admin login — stricter: 5 attempts per 15 minutes per IP.
 */
export const adminLoginLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 15 * 60_000,
      max: 5,
      keyGenerator: (req) => req.ip ?? 'unknown',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'Too many admin login attempts. Please try again in 15 minutes.',
        });
      },
    });

/**
 * Flag submission — per player+challenge: 1 per 5 seconds.
 */
export const submissionPerChallengeLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 5_000,
      max: 1,
      keyGenerator: (req) => {
        const playerId = (req as any).playerId ?? 'unknown';
        const challengeId = req.body?.challenge_id ?? 'unknown';
        return `${playerId}:${challengeId}`;
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'Please wait before submitting another flag for this challenge.',
        });
      },
    });

/**
 * Flag submission — global per player: 20 per 10 minutes.
 */
export const submissionGlobalLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 10 * 60_000,
      max: 20,
      keyGenerator: (req) => (req as any).playerId ?? req.ip ?? 'unknown',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'Global submission limit reached. Please wait before trying again.',
        });
      },
    });

/**
 * Support ticket creation: 5 per hour per player.
 */
export const ticketCreationLimiter = isDev
  ? dummyMiddleware
  : rateLimit({
      windowMs: 60 * 60_000,
      max: 5,
      keyGenerator: (req) => (req as any).playerId ?? req.ip ?? 'unknown',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: 'Ticket limit reached. Please wait before creating another support ticket.',
        });
      },
    });
