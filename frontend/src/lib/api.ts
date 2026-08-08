import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Axios instance for the Node/Express backend API.
 * Automatically attaches the Bearer token from the in-memory auth store.
 *
 * Security: The token is stored in memory only (Zustand store),
 * not in localStorage or sessionStorage — prevents XSS token theft.
 */
export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor: attach Bearer token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle global auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Session expired or invalidated — clear local state
      const { logout } = useAuthStore.getState();
      logout();
      // Don't redirect here — let the router handle it
    }
    return Promise.reject(error);
  }
);

/**
 * Admin API instance — uses admin token from separate store key.
 * Mounted on the same base URL, different auth token.
 */
export const adminApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

adminApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().adminToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { adminLogout } = useAuthStore.getState();
      adminLogout();
    }
    return Promise.reject(error);
  }
);
