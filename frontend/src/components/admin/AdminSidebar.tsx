import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Sword, Users, Calendar, Megaphone,
  AlertTriangle, MessageSquare, FileText, LogOut, Shield
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { adminApi } from '../../lib/api';

const navItems = [
  { to: '/admin', icon: <LayoutDashboard size={16} />, label: 'Dashboard', exact: true },
  { to: '/admin/events', icon: <Calendar size={16} />, label: 'Events' },
  { to: '/admin/challenges', icon: <Sword size={16} />, label: 'Challenges' },
  { to: '/admin/players', icon: <Users size={16} />, label: 'Players' },
  { to: '/admin/announcements', icon: <Megaphone size={16} />, label: 'Announcements' },
  { to: '/admin/suspicious', icon: <AlertTriangle size={16} />, label: 'Suspicious Activity' },
  { to: '/admin/support', icon: <MessageSquare size={16} />, label: 'Support Tickets' },
  { to: '/admin/audit', icon: <FileText size={16} />, label: 'Audit Log' },
];

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { adminLogout } = useAuthStore();

  const handleLogout = async () => {
    try { await adminApi.post('/api/admin/auth/logout'); } catch { /* ignore */ }
    adminLogout();
    navigate('/admin/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={20} color="var(--color-purple)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-purple)', fontSize: '0.95rem' }}>
            Admin Console
          </span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
          CTF Platform
        </div>
      </div>

      <nav>
        {navItems.map(item => {
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
              style={isActive ? { borderLeftColor: 'var(--color-purple)', color: 'var(--color-purple)', background: 'rgba(124,58,237,0.1)' } : {}}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: '24px 0 8px', borderTop: '1px solid var(--color-border)' }}>
        <button
          className="sidebar__nav-item"
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-red)' }}
          onClick={handleLogout}
        >
          <LogOut size={16} /> Logout
        </button>
      </div>
    </aside>
  );
}
