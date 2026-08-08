import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { formatDistanceToNow } from 'date-fns';

interface SuspiciousFlag {
  id: string;
  event_id: string;
  challenge_id: string | null;
  reason: string;
  related_player_ids: string[];
  related_submission_ids: string[];
  detected_at: string;
  status: string;
  challenges?: { title: string } | null;
  events?: { name: string } | null;
}

const reasonLabels: Record<string, { label: string; color: string }> = {
  shared_flag: { label: '⚠ Shared Flag', color: 'var(--color-red)' },
  rapid_attempts: { label: '⚡ Rapid Attempts', color: 'var(--color-amber)' },
  ip_mismatch: { label: '🌐 IP Hopping', color: 'var(--color-cyan)' },
  zero_time_solve: { label: '⏱ Zero-Time Solve', color: 'var(--color-purple)' },
};

export default function SuspiciousActivityFeed() {
  const [flags, setFlags] = useState<SuspiciousFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get(`/api/admin/suspicious?status=${statusFilter}`);
      setFlags(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFlags(); }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await adminApi.patch(`/api/admin/suspicious/${id}`, { status });
      toast.success(`Marked as ${status}`);
      setFlags(prev => prev.filter(f => f.id !== id));
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-red)' }}>// Suspicious Activity</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              {flags.length} {statusFilter} flag{flags.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {['open', 'reviewed', 'dismissed', 'actioned'].map(s => (
              <button key={s} className={`btn btn--sm ${statusFilter === s ? 'btn--outline' : 'btn--ghost'}`}
                style={statusFilter === s ? { borderColor: 'var(--color-red)', color: 'var(--color-red)' } : {}}
                onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="terminal-loader">Scanning for anomalies...</div></div>
        ) : flags.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={48} color="var(--color-easy)" />
            <p>No {statusFilter} suspicious flags</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {flags.map(flag => {
              const reason = reasonLabels[flag.reason] ?? { label: flag.reason, color: 'var(--color-text-muted)' };
              return (
                <div key={flag.id} className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                    <div>
                      <span style={{ color: reason.color, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem' }}>
                        {reason.label}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                        {flag.events?.name ?? flag.event_id}
                        {flag.challenges?.title && ` · ${flag.challenges.title}`}
                        {' · '}{formatDistanceToNow(new Date(flag.detected_at), { addSuffix: true })}
                      </div>
                    </div>
                    <span className="badge badge--red">{flag.status}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-5)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                    <div>
                      <div style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }}>Players Involved</div>
                      <div style={{ color: 'var(--color-text-primary)' }}>{flag.related_player_ids?.length ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }}>Related Submissions</div>
                      <div style={{ color: 'var(--color-text-primary)' }}>{flag.related_submission_ids?.length ?? 0}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                    <button className="btn btn--sm btn--ghost" onClick={() => updateStatus(flag.id, 'dismissed')}>
                      <X size={12} /> Dismiss
                    </button>
                    <button className="btn btn--sm btn--ghost" style={{ color: 'var(--color-amber)' }} onClick={() => updateStatus(flag.id, 'reviewed')}>
                      <Eye size={12} /> Mark Reviewed
                    </button>
                    <button className="btn btn--sm btn--danger" onClick={() => updateStatus(flag.id, 'actioned')}>
                      <AlertTriangle size={12} /> Take Action
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
