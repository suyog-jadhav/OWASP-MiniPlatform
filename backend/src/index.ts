import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter } from './middleware/rateLimiter';

// Routes
import authRouter from './routes/auth';
import adminAuthRouter from './routes/adminAuth';
import adminRouter from './routes/admin';
import playerRouter from './routes/player';
import submissionsRouter from './routes/submissions';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Locked to the Vercel frontend domain — never *
const allowedOrigin = process.env.ALLOWED_ORIGIN;
if (!allowedOrigin) {
  console.warn('[WARN] ALLOWED_ORIGIN not set — CORS will be very restrictive');
}

app.use(
  cors({
    origin: allowedOrigin ?? false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Global Rate Limit ─────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Trust proxy (required for correct IP extraction on Render) ────────────────
app.set('trust proxy', 1);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin', adminRouter);
app.use('/api', playerRouter);
app.use('/api/submissions', submissionsRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[CTF API] Running on port ${PORT} in ${process.env.NODE_ENV ?? 'development'} mode`);
  console.log(`[CTF API] CORS origin: ${allowedOrigin ?? 'NONE (restricted)'}`);
});

export default app;
