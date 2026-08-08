import { useState, useEffect } from 'react';
import { Users, Sword, Calendar, Trophy, AlertTriangle, MessageSquare, Activity } from 'lucide-react';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';

interface Stats {
  events: number;
  active_events: number;
  total_players: number;
  challenges: number;
  open_suspicious: number;
  open_tickets: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Partial<Stats>>({});
  const [loading, setLoading] = useState(true);
  const [recentAudit, setRecentAudit] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [events, suspicious, tickets, audit] = await Promise.all([
          adminApi.get('/api/admin/events'),
          adminApi.get('/api/admin/suspicious?status=open'),
          adminApi.get('/api/admin/support/tickets?status=open'),
          adminApi.get('/api/admin/audit?limit=10'),
        ]);

        setStats({
          events: events.data.length,
          active_events: events.data.filter((e: any) => e.status === 'active').length,
          open_suspicious: suspicious.data.length,
          open_tickets: tickets.data.length,
        });
        setRecentAudit(audit.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    fetchStats();
  }, []);

  const statItems = [
    { label: 'Total Events', value: stats.events ?? '—', icon: <Calendar size={20} />, color: 'var(--color-cyan)' },
    { label: 'Active Events', value: stats.active_events ?? '—', icon: <Activity size={20} />, color: 'var(--color-neon)' },
    { label: 'Suspicious Flags', value: stats.open_suspicious ?? '—', icon: <AlertTriangle size={20} />, color: stats.open_suspicious ? 'var(--color-red)' : 'var(--color-text-muted)' },
    { label: 'Open Tickets', value: stats.open_tickets ?? '—', icon: <MessageSquare size={20} />, color: stats.open_tickets ? 'var(--color-amber)' : 'var(--color-text-muted)' },
  ];

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Dashboard</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              {new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="stats-grid" style={{ marginBottom: 'var(--space-8)' }}>
          {statItems.map(stat => (
            <div key={stat.label} className="stat-card">
              <div style={{ color: stat.color, marginBottom: '8px' }}>{stat.icon}</div>
              <div className="stat-card__value" style={{ color: stat.color }}>{stat.value}</div>
              <div className="stat-card__label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Recent audit log */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>
            Recent Activity
          </h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Admin</th>
                  <th>IP</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>Loading...</td></tr>
                ) : recentAudit.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>No activity yet</td></tr>
                ) : recentAudit.map((log: any) => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--color-neon)', fontFamily: 'var(--font-mono)' }}>{log.action}</td>
                    <td>{log.admins?.email ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{log.ip}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
