import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Terminal, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const prefillEventId = searchParams.get('event') ?? '';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [eventId, setEventId] = useState(prefillEventId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionConflict, setSessionConflict] = useState(false);

  const handleLogin = async (force = false) => {
    if (!email || !code || !eventId) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = force ? '/api/auth/login/force' : '/api/auth/login';
      const res = await api.post(endpoint, { email, code, event_id: eventId });
      const { token, player_id, event_id } = res.data;

      login(token, player_id, event_id);
      toast.success('Access granted. Welcome to the arena.', { icon: '🟢' });
      navigate('/challenges');
    } catch (err: any) {
      const status = err.response?.status;
      const serverError = err.response?.data?.error;

      if (status === 409 && serverError === 'session_conflict') {
        setSessionConflict(true);
        setError(null);
      } else if (status === 429) {
        setError('Too many attempts. Please wait before trying again.');
      } else {
        setError(serverError === 'session_conflict'
          ? 'Session conflict'
          : (err.response?.data?.message ?? 'Invalid email or code'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--color-neon-glow)',
              border: '1px solid var(--color-border-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={28} color="var(--color-neon)" />
            </div>
          </div>
          <h1 className="navbar__logo-blink">CTF Platform</h1>
          <p>Enter your credentials to begin</p>
        </div>

        {/* Terminal header */}
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '24px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
        }}>
          <span style={{ color: 'var(--color-neon)' }}>$ </span>
          authenticate --event {eventId || '<event_id>'} --method access-code
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleLogin(false); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="player@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Access Code</label>
            <input
              id="access-code"
              type="text"
              className="form-input"
              placeholder="From your invite email"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={loading}
              required
            />
          </div>

          {!prefillEventId && (
            <div className="form-group">
              <label className="form-label">Event ID</label>
              <input
                id="event-id"
                type="text"
                className="form-input"
                placeholder="UUID from event organizer"
                value={eventId}
                onChange={e => setEventId(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <div className="alert alert--error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {sessionConflict ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="alert alert--warning">
                <AlertCircle size={16} />
                <span>
                  <strong>Active session detected.</strong> You're already logged in on another device.
                  Force login will disconnect the other session.
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setSessionConflict(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn btn--danger ${loading ? 'btn--loading' : ''}`}
                  onClick={() => handleLogin(true)}
                  disabled={loading}
                >
                  {!loading && <Terminal size={14} />}
                  Force Login
                </button>
              </div>
            </div>
          ) : (
            <button
              id="login-submit"
              type="submit"
              className={`btn btn--primary btn--full ${loading ? 'btn--loading' : ''}`}
              disabled={loading}
            >
              {!loading && <Shield size={16} />}
              {loading ? 'Authenticating...' : 'Access Platform'}
            </button>
          )}
        </form>

        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          Access codes are single-use and event-scoped.
        </p>
      </div>
    </div>
  );
}
