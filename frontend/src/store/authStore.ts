import { create } from 'zustand';

interface AuthState {
  // Player auth
  token: string | null;
  playerId: string | null;
  eventId: string | null;
  playerName: string | null;

  // Admin auth
  adminToken: string | null;
  adminId: string | null;

  // Actions
  login: (token: string, playerId: string, eventId: string) => void;
  logout: () => void;
  adminLogin: (token: string) => void;
  adminLogout: () => void;
  setPlayerName: (name: string) => void;
}

/**
 * In-memory authentication store.
 *
 * Security properties:
 * - Tokens stored in JavaScript memory ONLY, not localStorage/sessionStorage
 * - This prevents XSS-based token exfiltration from persistent storage
 * - Tokens are lost on page refresh (by design for the player app)
 * - The event_id is stored for convenience to avoid re-fetching
 *
 * Note: Since we don't persist to localStorage, page refreshes will
 * require re-authentication. This is acceptable for a CTF event context
 * where players are expected to stay logged in during the event.
 * If persistence is needed, use httpOnly cookies on the backend instead.
 */
const initialPlayerToken = localStorage.getItem('player_token') || null;
const initialPlayerId = localStorage.getItem('player_id') || null;
const initialPlayerEventId = localStorage.getItem('player_event_id') || null;
const initialPlayerName = localStorage.getItem('player_name') || null;
const initialAdminToken = localStorage.getItem('admin_token') || null;

export const useAuthStore = create<AuthState>((set) => ({
  token: initialPlayerToken,
  playerId: initialPlayerId,
  eventId: initialPlayerEventId,
  playerName: initialPlayerName,
  adminToken: initialAdminToken,
  adminId: null,

  login: (token, playerId, eventId) => {
    localStorage.setItem('player_token', token);
    localStorage.setItem('player_id', playerId);
    localStorage.setItem('player_event_id', eventId);
    set({ token, playerId, eventId });
  },

  logout: () => {
    localStorage.removeItem('player_token');
    localStorage.removeItem('player_id');
    localStorage.removeItem('player_event_id');
    localStorage.removeItem('player_name');
    set({ token: null, playerId: null, eventId: null, playerName: null });
  },

  adminLogin: (token) => {
    localStorage.setItem('admin_token', token);
    set({ adminToken: token });
  },

  adminLogout: () => {
    localStorage.removeItem('admin_token');
    set({ adminToken: null, adminId: null });
  },

  setPlayerName: (name) => {
    localStorage.setItem('player_name', name);
    set({ playerName: name });
  },
}));
