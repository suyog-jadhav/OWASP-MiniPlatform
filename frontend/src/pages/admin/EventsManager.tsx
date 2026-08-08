import { useState, useEffect } from 'react';
import { Plus, Edit2, Snowflake, Eye, EyeOff, Play, Square, Trash2, X, ListTodo } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { format } from 'date-fns';

interface Event {
  id: string;
  name: string;
  description: string;
  start_time: string;
  end_time: string;
  status: 'draft' | 'active' | 'closed';
  scoreboard_visible: boolean;
  scoreboard_frozen_at: string | null;
  created_at: string;
}

const emptyForm = {
  name: '', description: '',
  start_time: '', end_time: '',
  scoreboard_visible: true,
};

export default function EventsManager() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchEvents = async () => {
    const res = await adminApi.get('/api/admin/events');
    setEvents(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  const openCreate = () => { setForm(emptyForm); setEditing(null); setShowForm(true); };
  const openEdit = (evt: Event) => {
    setForm({
      name: evt.name, description: evt.description ?? '',
      start_time: format(new Date(evt.start_time), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(new Date(evt.end_time), "yyyy-MM-dd'T'HH:mm"),
      scoreboard_visible: evt.scoreboard_visible,
    });
    setEditing(evt);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
      };
      if (editing) {
        await adminApi.patch(`/api/admin/events/${editing.id}`, payload);
        toast.success('Event updated');
      } else {
        await adminApi.post('/api/admin/events', payload);
        toast.success('Event created');
      }
      setShowForm(false);
      fetchEvents();
    } catch (err: any) {
      let msg = 'Failed to save event';
      if (err.response?.data?.error) {
        if (typeof err.response.data.error === 'string') {
          msg = err.response.data.error;
        } else if (err.response.data.error.fieldErrors) {
          msg = Object.entries(err.response.data.error.fieldErrors)
            .map(([field, errors]: any) => `${field}: ${errors.join(', ')}`)
            .join(' | ');
        }
      }
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await adminApi.patch(`/api/admin/events/${id}`, { status });
      toast.success(`Event ${status}`);
      fetchEvents();
    } catch { toast.error('Failed to update status'); }
  };

  const toggleFreeze = async (evt: Event) => {
    const frozen = !evt.scoreboard_frozen_at;
    await adminApi.patch(`/api/admin/events/${evt.id}`, {
      scoreboard_frozen_at: frozen ? new Date().toISOString() : null,
    });
    toast.success(frozen ? 'Scoreboard frozen' : 'Scoreboard unfrozen');
    fetchEvents();
  };

  const toggleVisibility = async (evt: Event) => {
    await adminApi.patch(`/api/admin/events/${evt.id}`, { scoreboard_visible: !evt.scoreboard_visible });
    toast.success(evt.scoreboard_visible ? 'Scoreboard hidden' : 'Scoreboard visible');
    fetchEvents();
  };

  const statusBadge = (status: string) => {
    const colors = { draft: 'var(--color-text-muted)', active: 'var(--color-neon)', closed: 'var(--color-red)' };
    return (
      <span className="badge" style={{ background: 'transparent', border: `1px solid ${colors[status as keyof typeof colors]}`, color: colors[status as keyof typeof colors] }}>
        {status}
      </span>
    );
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Events</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{events.length} total events</p>
          </div>
          <button className="btn btn--outline" style={{ borderColor: 'var(--color-purple)', color: 'var(--color-purple)' }} onClick={openCreate}>
            <Plus size={15} /> New Event
          </button>
        </div>

        {loading ? (
          <div className="empty-state"><div className="terminal-loader">Loading events...</div></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Scoreboard</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No events yet</td></tr>
                ) : events.map(evt => (
                  <tr key={evt.id}>
                    <td style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{evt.name}</td>
                    <td>{statusBadge(evt.status)}</td>
                    <td style={{ fontSize: '0.8rem' }}>{format(new Date(evt.start_time), 'MMM d, yyyy HH:mm')}</td>
                    <td style={{ fontSize: '0.8rem' }}>{format(new Date(evt.end_time), 'MMM d, yyyy HH:mm')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn--sm btn--ghost" onClick={() => toggleVisibility(evt)} title={evt.scoreboard_visible ? 'Hide scoreboard' : 'Show scoreboard'}>
                          {evt.scoreboard_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button className="btn btn--sm btn--ghost" onClick={() => toggleFreeze(evt)} title={evt.scoreboard_frozen_at ? 'Unfreeze' : 'Freeze'}>
                          <Snowflake size={13} color={evt.scoreboard_frozen_at ? 'var(--color-cyan)' : undefined} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button className="btn btn--sm btn--ghost" onClick={() => openEdit(evt)} title="Edit Event"><Edit2 size={13} /></button>
                        <button 
                          className="btn btn--sm btn--outline" 
                          style={{ borderColor: 'var(--color-purple)', color: 'var(--color-purple)', padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => navigate(`/admin/challenges?event_id=${evt.id}`)}
                        >
                          <ListTodo size={12} /> Challenges
                        </button>
                        {evt.status === 'draft' && (
                          <button className="btn btn--sm btn--outline" style={{ borderColor: 'var(--color-neon)', color: 'var(--color-neon)', padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => updateStatus(evt.id, 'active')}>
                            <Play size={12} /> Activate
                          </button>
                        )}
                        {evt.status === 'active' && (
                          <button className="btn btn--sm btn--danger" style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => updateStatus(evt.id, 'closed')}>
                            <Square size={12} /> Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showForm && (
          <div className="modal-overlay">
            <div className="modal">
              <button className="modal__close" onClick={() => setShowForm(false)}><X size={18} /></button>
              <h2 style={{ marginBottom: 'var(--space-6)', fontSize: '1.1rem', color: 'var(--color-purple)' }}>
                {editing ? 'Edit Event' : 'Create Event'}
              </h2>
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Event Name</label>
                  <input type="text" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input type="datetime-local" className="form-input" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input type="datetime-local" className="form-input" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} required />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.scoreboard_visible} onChange={e => setForm(p => ({ ...p, scoreboard_visible: e.target.checked }))} />
                  Scoreboard visible to players
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button type="submit" className={`btn btn--primary ${saving ? 'btn--loading' : ''}`} disabled={saving}
                    style={{ background: 'var(--color-purple)', border: '1px solid var(--color-purple)' }}>
                    {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Event')}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
