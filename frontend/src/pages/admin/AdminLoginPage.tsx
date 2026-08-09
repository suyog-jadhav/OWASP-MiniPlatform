import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { adminLogin } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await adminApi.post('/api/admin/auth/login', { email, password });
      adminLogin(res.data.token);
      toast.success('Admin access granted', { icon: '🔐' });
      navigate('/admin');
    } catch (err: any) {
      const status = err.response?.status;
      const serverError = err.response?.data;

      if (status === 401) {
        setError('Invalid email or password');
      } else if (status === 429) {
        setError('Too many attempts. Please wait 15 minutes.');
      } else {
        setError(serverError?.error || serverError?.message || err.message || 'Failed to connect to backend server');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div className="login-logo">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(124,58,237,0.15)',
              border: '1px solid rgba(124,58,237,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={28} color="var(--color-purple)" />
            </div>
          </div>
          <h1 style={{ color: 'var(--color-purple)' }}>Admin Console</h1>
          <p>Restricted access — authorized personnel only</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <input
              id="admin-email"
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              id="admin-password"
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="alert alert--error"><AlertCircle size={15} />{error}</div>}
          <button type="submit" className={`btn btn--full ${loading ? 'btn--loading' : ''}`}
            style={{ background: 'var(--color-purple)', color: '#fff', border: '1px solid var(--color-purple)' }} disabled={loading}>
            {!loading && <Lock size={15} />}
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
