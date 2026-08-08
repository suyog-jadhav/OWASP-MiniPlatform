import { useState, useEffect } from 'react';
import { Upload, UserX, RefreshCw, Plus, Mail, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { formatDistanceToNow } from 'date-fns';

interface Player {
  id: string;
  revoked: boolean;
  invited_at: string;
  used_at: string | null;
  last_login_at: string | null;
  active_session_id: string | null;
  players: { id: string; email: string; name: string; global_banned: boolean };
}

interface Event { id: string; name: string; }

export default function PlayersManager() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [loginBaseUrl, setLoginBaseUrl] = useState(window.location.origin);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '' });

  useEffect(() => {
    adminApi.get('/api/admin/events').then(r => {
      setEvents(r.data);
      if (r.data.length > 0) setSelectedEvent(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    setLoading(true);
    adminApi.get(`/api/admin/events/${selectedEvent}/players`)
      .then(r => setPlayers(r.data))
      .finally(() => setLoading(false));
  }, [selectedEvent]);

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvContent(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvContent || !selectedEvent) return;
    setImporting(true);
    try {
      const res = await adminApi.post('/api/admin/players/import', {
        event_id: selectedEvent, csv_content: csvContent, login_base_url: loginBaseUrl,
      });
      toast.success(`Invited ${res.data.invited} players${res.data.errors.length > 0 ? `, ${res.data.errors.length} errors` : ''}`);
      setShowImport(false);
      setCsvContent('');
      adminApi.get(`/api/admin/events/${selectedEvent}/players`).then(r => setPlayers(r.data));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Import failed');
    } finally { setImporting(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.post('/api/admin/players/invite', {
        event_id: selectedEvent, email: inviteForm.email, name: inviteForm.name, login_base_url: loginBaseUrl,
      });
      toast.success('Invite sent');
      setShowInvite(false);
      setInviteForm({ email: '', name: '' });
      adminApi.get(`/api/admin/events/${selectedEvent}/players`).then(r => setPlayers(r.data));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed');
    }
  };

  const revokePlayer = async (epId: string) => {
    if (!confirm('Revoke this player\'s access?')) return;
    await adminApi.post(`/api/admin/players/${epId}/revoke`);
    toast.success('Player revoked');
    setPlayers(prev => prev.map(p => p.id === epId ? { ...p, revoked: true } : p));
  };

  const resetSession = async (epId: string) => {
    await adminApi.post(`/api/admin/players/${epId}/reset-session`);
    toast.success('Session reset. Player can log in again.');
    setPlayers(prev => prev.map(p => p.id === epId ? { ...p, active_session_id: null } : p));
  };

  const getStatus = (p: Player) => {
    if (p.revoked) return { label: 'Revoked', color: 'var(--color-red)' };
    if (p.active_session_id) return { label: 'Active', color: 'var(--color-neon)' };
    if (p.used_at) return { label: 'Logged in', color: 'var(--color-cyan)' };
    return { label: 'Invited', color: 'var(--color-text-muted)' };
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Players</h1>
            <select className="form-select" style={{ marginTop: '8px', width: '220px' }} value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
              <option value="">Select event...</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn--ghost" onClick={() => setShowInvite(true)} disabled={!selectedEvent}>
              <Plus size={14} /> Invite Player
            </button>
            <button className="btn btn--outline" style={{ borderColor: 'var(--color-purple)', color: 'var(--color-purple)' }} onClick={() => setShowImport(true)} disabled={!selectedEvent}>
              <Upload size={14} /> Import CSV
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>Loading...</td></tr>
              ) : players.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No players yet. Import a CSV or invite individually.</td></tr>
              ) : players.map(p => {
                const status = getStatus(p);
                return (
                  <tr key={p.id} style={{ opacity: p.revoked ? 0.5 : 1 }}>
                    <td style={{ fontWeight: 600 }}>{p.players.name ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{p.players.email}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: status.color, fontFamily: 'var(--font-mono)' }}>
                        <span className="status-dot" style={{ background: status.color }} />
                        {status.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {p.last_login_at ? formatDistanceToNow(new Date(p.last_login_at), { addSuffix: true }) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {p.active_session_id && !p.revoked && (
                          <button className="btn btn--sm btn--ghost" onClick={() => resetSession(p.id)} title="Reset session">
                            <RefreshCw size={12} />
                          </button>
                        )}
                        {!p.revoked && (
                          <button className="btn btn--sm btn--ghost" style={{ color: 'var(--color-red)' }} onClick={() => revokePlayer(p.id)} title="Revoke access">
                            <Ban size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CSV Import Modal */}
        {showImport && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 540 }}>
              <button className="modal__close" onClick={() => setShowImport(false)}>✕</button>
              <h2 style={{ color: 'var(--color-purple)', marginBottom: 'var(--space-6)' }}>Import Players (CSV)</h2>
              <div className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
                CSV must have headers: <code>email,name</code> (name is optional)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">CSV File</label>
                  <input type="file" accept=".csv" onChange={handleFileRead}
                    style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Login URL Base</label>
                  <input type="url" className="form-input" value={loginBaseUrl} onChange={e => setLoginBaseUrl(e.target.value)} />
                </div>
                {csvContent && (
                  <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)', maxHeight: 120, overflow: 'auto' }}>
                    {csvContent.slice(0, 300)}...
                  </div>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button className={`btn btn--primary ${importing ? 'btn--loading' : ''}`}
                    style={{ background: 'var(--color-purple)', border: '1px solid var(--color-purple)' }}
                    onClick={handleImport} disabled={!csvContent || importing}>
                    {importing ? 'Importing...' : 'Import & Send Invites'}
                  </button>
                  <button className="btn btn--ghost" onClick={() => setShowImport(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Single Invite Modal */}
        {showInvite && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 420 }}>
              <button className="modal__close" onClick={() => setShowInvite(false)}>✕</button>
              <h2 style={{ color: 'var(--color-purple)', marginBottom: 'var(--space-6)' }}>Invite Player</h2>
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Name (optional)</label>
                  <input type="text" className="form-input" value={inviteForm.name} onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button type="submit" className="btn" style={{ background: 'var(--color-purple)', color: '#fff', border: '1px solid var(--color-purple)' }}>
                    <Mail size={14} /> Send Invite
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setShowInvite(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
