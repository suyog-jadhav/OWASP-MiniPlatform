import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

/**
 * Supabase client with ANON key only.
 * Used ONLY for:
 *   - Realtime subscriptions (scoreboard, announcements)
 *   - Direct reads of public/RLS-gated data (events_public, challenges_public, scoreboard_cache, announcements)
 *
 * NEVER used for flag checking, session management, or any write operation.
 * All sensitive operations go through the Node API.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
