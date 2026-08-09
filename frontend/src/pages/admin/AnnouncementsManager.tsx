import { useState, useEffect } from 'react';
import { Plus, Megaphone, Edit3, Trash2 } from 'lucide-react';
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

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');

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

  const handleSaveEdit = async (id: string) => {
    if (!editMessage.trim()) return;
    try {
      const res = await adminApi.patch(`/api/admin/announcements/${id}`, { message: editMessage });
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, message: res.data.message } : a));
      setEditingId(null);
      toast.success('Announcement updated');
    } catch {
      toast.error('Failed to update announcement');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      await adminApi.delete(`/api/admin/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      toast.success('Announcement deleted');
    } catch {
      toast.error('Failed to delete announcement');
    }
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
            {announcements.map(a => {
              const isEditing = a.id === editingId;
              return (
                <div key={a.id} className="announcement" style={{ borderLeft: '3px solid var(--color-purple)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                    {!isEditing && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn--sm btn--ghost" style={{ padding: '4px 8px', minWidth: 'auto', fontSize: '0.75rem', color: 'var(--color-cyan)' }}
                          onClick={() => { setEditingId(a.id); setEditMessage(a.message); }} title="Edit announcement">
                          <Edit3 size={12} style={{ marginRight: '4px', display: 'inline' }} /> Edit
                        </button>
                        <button className="btn btn--sm btn--ghost" style={{ padding: '4px 8px', minWidth: 'auto', fontSize: '0.75rem', color: 'var(--color-red)' }}
                          onClick={() => handleDelete(a.id)} title="Delete announcement">
                          <Trash2 size={12} style={{ marginRight: '4px', display: 'inline' }} /> Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                      <textarea className="form-textarea" value={editMessage} onChange={e => setEditMessage(e.target.value)} rows={2} required />
                      <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                        <button className="btn btn--sm btn--primary" style={{ background: 'var(--color-purple)', border: '1px solid var(--color-purple)' }} onClick={() => handleSaveEdit(a.id)} disabled={!editMessage.trim()}>
                          Save
                        </button>
                        <button className="btn btn--sm btn--ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>{a.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
