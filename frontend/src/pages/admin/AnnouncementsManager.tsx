import { useState, useEffect } from 'react';
import { Plus, Megaphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { formatDistanceToNow } from 'date-fns';

interface Event { id: string; name: string; }
interface Announcement { id: string; message: string; created_at: string; event_id: string; }

export default function AnnouncementsManager() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    adminApi.get('/api/admin/events').then(r => {
      setEvents(r.data);
      if (r.data.length > 0) setSelectedEvent(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;
    adminApi.get(`/api/admin/announcements/${selectedEvent}`).then(r => setAnnouncements(r.data)).catch(() => {});
  }, [selectedEvent]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedEvent) return;
    setSending(true);
    try {
      const res = await adminApi.post('/api/admin/announcements', { event_id: selectedEvent, message });
      setAnnouncements(prev => [res.data, ...prev]);
      setMessage('');
      toast.success('Announcement sent to all players');
    } catch { toast.error('Failed to send announcement'); }
    finally { setSending(false); }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Announcements</h1>
            <select className="form-select" style={{ marginTop: '8px', width: '220px' }} value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
              <option value="">Select event...</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
        </div>

        {/* Compose */}
        <div className="card card--glow" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', marginBottom: 'var(--space-4)', color: 'var(--color-neon)' }}>
            <Megaphone size={16} style={{ display: 'inline', marginRight: '8px' }} />
            Broadcast Announcement
          </h3>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <textarea className="form-textarea" value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Type your announcement... (Realtime delivered to all players)" rows={3} required />
            </div>
            <button type="submit" className={`btn btn--primary ${sending ? 'btn--loading' : ''}`} disabled={sending || !message.trim() || !selectedEvent}
              style={{ alignSelf: 'flex-end' }}>
              {!sending && <Megaphone size={14} />}
              {sending ? 'Sending...' : 'Broadcast'}
            </button>
          </form>
        </div>

        {/* History */}
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          Announcement History
        </h3>
        {announcements.length === 0 ? (
          <div className="empty-state"><p>No announcements yet</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {announcements.map(a => (
              <div key={a.id} className="announcement">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p style={{ color: 'var(--color-text-primary)' }}>{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
