import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Terminal, Trophy, MessageSquare, Megaphone, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, playerName } = useAuthStore();

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch { /* ignore */ }
    logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const navLinks = [
    { to: '/challenges', icon: <Terminal size={15} />, label: 'Challenges' },
    { to: '/scoreboard', icon: <Trophy size={15} />, label: 'Scoreboard' },
    { to: '/support', icon: <MessageSquare size={15} />, label: 'Support' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar__inner">
        <Link to="/challenges" className="navbar__logo">
          <Terminal size={18} />
          CTF<span className="navbar__logo-blink"></span>
        </Link>

        <div className="navbar__nav">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`btn btn--sm ${location.pathname === link.to ? 'btn--outline' : 'btn--ghost'}`}
            >
              {link.icon} {link.label}
            </Link>
          ))}
          <button className="btn btn--sm btn--ghost" onClick={handleLogout} style={{ marginLeft: '8px' }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
