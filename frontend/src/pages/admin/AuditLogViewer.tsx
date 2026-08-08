import { useState, useEffect } from 'react';
import { Search, Filter } from 'lucide-react';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { format } from 'date-fns';

interface AuditEntry {
  id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string;
  created_at: string;
  admins?: { email: string };
}

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (actionFilter) params.append('action', actionFilter);
      const res = await adminApi.get(`/api/admin/audit?${params}`);
      setLogs(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [page, actionFilter]);

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('revoke')) return 'var(--color-red)';
    if (action.includes('create') || action.includes('invite')) return 'var(--color-neon)';
    if (action.includes('login')) return 'var(--color-cyan)';
    if (action.includes('update') || action.includes('reset')) return 'var(--color-amber)';
    return 'var(--color-text-muted)';
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Audit Log</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Complete admin action history</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Search size={16} color="var(--color-text-muted)" />
            <input type="text" className="form-input" placeholder="Filter by action..."
              value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}
              style={{ width: 220 }} />
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Admin</th>
                <th>Target</th>
                <th>IP</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No audit entries</td></tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: actionColor(log.action) }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{log.admins?.email ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {log.target_table ?? '—'}
                    {log.target_id && (
                      <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.7rem' }}>
                        {log.target_id.slice(0, 8)}...
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{log.ip}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-6)' }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            ← Previous
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)', alignSelf: 'center' }}>
            Page {page + 1}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE}>
            Next →
          </button>
        </div>
      </main>
    </div>
  );
}
