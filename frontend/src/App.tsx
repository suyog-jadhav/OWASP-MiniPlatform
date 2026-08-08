import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Player pages
import LoginPage from './pages/player/LoginPage';
import ChallengePage from './pages/player/ChallengePage';
import ScoreboardPage from './pages/player/ScoreboardPage';
import SupportPage from './pages/player/SupportPage';

// Admin pages
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import EventsManager from './pages/admin/EventsManager';
import ChallengesManager from './pages/admin/ChallengesManager';
import PlayersManager from './pages/admin/PlayersManager';
import AnnouncementsManager from './pages/admin/AnnouncementsManager';
import SuspiciousActivityFeed from './pages/admin/SuspiciousActivityFeed';
import SupportInbox from './pages/admin/SupportInbox';
import AuditLogViewer from './pages/admin/AuditLogViewer';

/**
 * Route guard: redirects unauthenticated players to login.
 */
function PlayerRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Route guard: redirects unauthenticated admins to admin login.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { adminToken } = useAuthStore();
  if (!adminToken) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Player routes */}
      <Route path="/challenges" element={<PlayerRoute><ChallengePage /></PlayerRoute>} />
      <Route path="/scoreboard" element={<PlayerRoute><ScoreboardPage /></PlayerRoute>} />
      <Route path="/support" element={<PlayerRoute><SupportPage /></PlayerRoute>} />

      {/* Admin routes */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/events" element={<AdminRoute><EventsManager /></AdminRoute>} />
      <Route path="/admin/challenges" element={<AdminRoute><ChallengesManager /></AdminRoute>} />
      <Route path="/admin/players" element={<AdminRoute><PlayersManager /></AdminRoute>} />
      <Route path="/admin/announcements" element={<AdminRoute><AnnouncementsManager /></AdminRoute>} />
      <Route path="/admin/suspicious" element={<AdminRoute><SuspiciousActivityFeed /></AdminRoute>} />
      <Route path="/admin/support" element={<AdminRoute><SupportInbox /></AdminRoute>} />
      <Route path="/admin/audit" element={<AdminRoute><AuditLogViewer /></AdminRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
