import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const isPlaceholder =
  !supabaseUrl ||
  !supabaseServiceRoleKey ||
  supabaseServiceRoleKey.startsWith('placeholder');

if (isPlaceholder) {
  console.warn(
    '[WARN] Supabase service role key is missing or placeholder. ' +
    'API calls requiring the database will fail until real keys are provided.\n' +
    '       → Add SUPABASE_SERVICE_ROLE_KEY to backend/.env'
  );
}

/**
 * Supabase client initialized with the service role key.
 * This client bypasses Row Level Security — ONLY use server-side.
 * NEVER expose this key or this client to the browser.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceRoleKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket as any,
    },
  }
);
