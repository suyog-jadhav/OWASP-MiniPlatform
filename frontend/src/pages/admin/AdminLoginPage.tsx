import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Smartphone, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

type Step = 'credentials' | 'totp' | 'totp_setup';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { adminLogin } = useAuthStore();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [adminIdForSetup, setAdminIdForSetup] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Try login with just credentials first (to get TOTP prompt)
      const res = await adminApi.post('/api/admin/auth/login', { email, password });
      // If this succeeds without TOTP somehow (shouldn't happen), log in
      adminLogin(res.data.token);
      navigate('/admin');
    } catch (err: any) {
      const status = err.response?.status;
      const serverError = err.response?.data;

      if (status === 403 && serverError?.error === 'totp_setup_required') {
        // First-time setup required
        setAdminIdForSetup(serverError.admin_id);
        await initiateTotpSetup(serverError.admin_id);
      } else if (status === 400 && serverError?.error === 'TOTP code required') {
        // Already has TOTP — go to code entry step
        setStep('totp');
      } else if (status === 401) {
        setError('Invalid email or password');
      } else if (status === 429) {
        setError('Too many attempts. Please wait 15 minutes.');
      } else {
        // Likely needs TOTP
        setStep('totp');
      }
    } finally {
      setLoading(false);
    }
  };

  const initiateTotpSetup = async (adminId: string) => {
    try {
      const res = await adminApi.post('/api/admin/auth/setup-totp', {
        admin_id: adminId,
        password,
      });
      setQrCode(res.data.qr_code);
      setTotpSecret(res.data.secret);
      setStep('totp_setup');
    } catch {
      setError('Failed to initiate TOTP setup');
    }
  };

  const handleTotpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setLoading(true);
    setError(null);

    try {
      const res = await adminApi.post('/api/admin/auth/login', {
        email, password, totp_code: totpCode,
      });
      adminLogin(res.data.token);
      toast.success('Admin access granted', { icon: '🔐' });
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Invalid TOTP code');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await adminApi.post('/api/admin/auth/verify-totp', {
        admin_id: adminIdForSetup,
        totp_code: totpCode,
      });
      toast.success('2FA enabled! Now log in with your authenticator code.');
      setStep('totp');
      setTotpCode('');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Invalid code');
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

        {step === 'credentials' && (
          <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input id="admin-email" type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} autoComplete="email" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input id="admin-password" type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
            </div>
            {error && <div className="alert alert--error"><AlertCircle size={15} />{error}</div>}
            <button type="submit" className={`btn btn--full ${loading ? 'btn--loading' : ''}`}
              style={{ background: 'var(--color-purple)', color: '#fff', border: '1px solid var(--color-purple)' }} disabled={loading}>
              {!loading && <Lock size={15} />}
              {loading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'totp' && (
          <form onSubmit={handleTotpLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div className="alert alert--info">
              <Smartphone size={16} />
              Enter the 6-digit code from your authenticator app.
            </div>
            <div className="form-group">
              <label className="form-label">TOTP Code</label>
              <input
                id="totp-code"
                type="text"
                className="form-input"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                pattern="\d{6}"
                autoFocus
                disabled={loading}
                style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.5rem' }}
              />
            </div>
            {error && <div className="alert alert--error"><AlertCircle size={15} />{error}</div>}
            <button type="submit" className={`btn btn--full ${loading ? 'btn--loading' : ''}`}
              style={{ background: 'var(--color-purple)', color: '#fff', border: '1px solid var(--color-purple)' }} disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--full" onClick={() => { setStep('credentials'); setError(null); }}>
              ← Back
            </button>
          </form>
        )}

        {step === 'totp_setup' && (
          <div>
            <div className="alert alert--warning" style={{ marginBottom: 'var(--space-5)' }}>
              <Smartphone size={16} />
              <span><strong>2FA Setup Required.</strong> Scan this QR code with Google Authenticator or similar, then enter the code below.</span>
            </div>
            {qrCode && (
              <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
                <img src={qrCode} alt="TOTP QR Code" style={{ width: 180, height: 180, border: '3px solid var(--color-purple)', borderRadius: '8px' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  Or enter manually: <strong style={{ color: 'var(--color-text-primary)' }}>{totpSecret}</strong>
                </div>
              </div>
            )}
            <form onSubmit={handleTotpVerify} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Confirm 6-Digit Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.5rem' }}
                />
              </div>
              {error && <div className="alert alert--error"><AlertCircle size={15} />{error}</div>}
              <button type="submit" className={`btn btn--full ${loading ? 'btn--loading' : ''}`}
                style={{ background: 'var(--color-purple)', color: '#fff', border: '1px solid var(--color-purple)' }} disabled={loading || totpCode.length !== 6}>
                Enable 2FA & Continue
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
