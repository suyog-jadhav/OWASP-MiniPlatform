# Mini CTF Platform

A security-hardened Capture The Flag competition platform.

**Stack:** React + Vite (Vercel) · Node/Express (Render) · Supabase (Postgres + Storage + Realtime)

---

## Quick Start

### Prerequisites
- Node.js 20+
- Supabase project (get URL + keys from dashboard)
- Resend account (for invite emails)

### 1. Database Setup

Run migrations in order in the Supabase SQL editor:

```bash
supabase/migrations/001_core_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_indexes.sql
```

Also create the `challenge-files` Storage bucket in Supabase (set to **private**).

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your values in .env
npm install
npm run dev       # dev server on :3000
```

Required `.env` values:
| Key | Description |
|-----|-------------|
| `SUPABASE_URL` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service role** key — never expose this |
| `ALLOWED_ORIGIN` | Your Vercel frontend URL (or `http://localhost:5173` for dev) |
| `RESEND_API_KEY` | From resend.com |
| `EMAIL_FROM` | Verified sender email on Resend |

### 3. Create First Admin

```bash
# With dev server running:
curl -X POST http://localhost:3000/api/admin/auth/create \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-strong-password-12chars+"}'

# Then set up TOTP (mandatory):
curl -X POST http://localhost:3000/api/admin/auth/setup-totp \
  -H "Content-Type: application/json" \
  -d '{"admin_id": "<id-from-above>", "password": "your-strong-password"}'
# Scan the returned QR code with Google Authenticator

# Then verify TOTP to enable it:
curl -X POST http://localhost:3000/api/admin/auth/verify-totp \
  -H "Content-Type: application/json" \
  -d '{"admin_id": "<id>", "totp_code": "123456"}'
```

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm install
npm run dev       # dev server on :5173
```

> ⚠️ Only the **anon key** goes in the frontend `.env`. The service role key MUST stay server-side.

---

## Architecture

```
Frontend (Vercel)          Backend (Render)             Supabase
─────────────────          ────────────────             ────────
React + Vite               Node/Express + TS            Postgres (RLS)
- Player UI                - Auth (player + admin)      - challenge_flags (never exposed)
- Admin console            - Flag checking              - sessions
- Supabase Realtime sub    - Rate limiting              - audit logs
                           - Suspicious activity        Storage (private bucket)
                           - CSV import + emails        Realtime (scoreboard, announcements)
```

---

## Security Architecture

| Concern | Implementation |
|---------|----------------|
| Flag checking | Server-side only, SHA-256 + `crypto.timingSafeEqual` |
| Session tokens | 256-bit random, SHA-256 stored, never in localStorage |
| Admin passwords | argon2id (64MiB, t=3) |
| Admin 2FA | TOTP mandatory via `otplib`, QR code setup flow |
| Rate limiting | Layered: global (100/min), login (5/10min), submission (1/5s) |
| CORS | Locked to `ALLOWED_ORIGIN` — never `*` |
| Secret exposure | `challenge_flags` table: GRANT revoked from anon, excluded from all views |
| Single session | One active session per player per event — force-login to switch devices |
| Suspicious activity | Async detection: shared flags, brute force, IP hopping |

---

## Deployment

### Vercel (Frontend)
1. Connect your repo
2. Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`
3. Build command: `npm run build`, Output directory: `dist`

### Render (Backend)
1. Use a **paid Web Service** tier (free tier sleeps — catastrophic during events)
2. Build command: `npm run build`
3. Start command: `npm start`
4. Set all environment variables from `backend/.env.example`
5. Set `ALLOWED_ORIGIN` to your Vercel domain

---

## URL Structure

| Route | Description |
|-------|-------------|
| `/login?event=<uuid>` | Player login (event_id pre-filled from URL) |
| `/challenges` | Challenge grid (player) |
| `/scoreboard` | Live scoreboard (player) |
| `/support` | Support tickets (player) |
| `/admin/login` | Admin login |
| `/admin` | Admin dashboard |
| `/admin/events` | Event management |
| `/admin/challenges` | Challenge management |
| `/admin/players` | Player management + CSV import |
| `/admin/announcements` | Broadcast announcements |
| `/admin/suspicious` | Suspicious activity feed |
| `/admin/support` | Support ticket inbox |
| `/admin/audit` | Admin audit log |

---

## API Reference (Key Endpoints)

```
POST /api/auth/login              Player login (email + access code)
POST /api/auth/login/force        Force-login (revoke old session)
POST /api/auth/logout             Logout

POST /api/admin/auth/login        Admin login (password + TOTP)
POST /api/admin/auth/setup-totp   First-time TOTP setup
POST /api/admin/auth/verify-totp  Confirm TOTP setup

GET  /api/challenges              List visible challenges (auth'd player)
POST /api/submissions             Submit a flag

GET  /api/scoreboard/:event_id    Public scoreboard (respects freeze/visibility)
GET  /api/announcements/:event_id Event announcements

POST /api/admin/players/import    Bulk CSV player import
POST /api/admin/players/invite    Single player invite
POST /api/admin/players/:id/revoke         Revoke access
POST /api/admin/players/:id/reset-session  Admin session reset
```
