import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, X, Upload, Flag, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';

interface Category { id: string; name: string; event_id: string; }
interface Event { id: string; name: string; }
interface Challenge {
  id: string; event_id: string; category_id: string;
  title: string; description: string; points: number;
  difficulty: 'easy' | 'medium' | 'hard'; visible: boolean;
  max_attempts: number | null; created_at: string;
  categories?: { name: string };
  challenge_flags?: { flag_hash: string; flag_format_regex?: string } | null;
}

const emptyForm = {
  event_id: '', category_id: '', title: '', description: '',
  points: 100, difficulty: 'medium' as 'easy' | 'medium' | 'hard', visible: false,
  max_attempts: '', flag: '', flag_format_regex: '',
};

export default function ChallengesManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlEventId = searchParams.get('event_id');

  const [events, setEvents] = useState<Event[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    adminApi.get('/api/admin/events').then(r => {
      setEvents(r.data);
      if (urlEventId && r.data.some((ev: Event) => ev.id === urlEventId)) {
        setSelectedEvent(urlEventId);
      } else if (r.data.length > 0) {
        setSelectedEvent(r.data[0].id);
      }
    });
  }, [urlEventId]);

  useEffect(() => {
    if (!selectedEvent) return;
    setLoading(true);
    Promise.all([
      adminApi.get(`/api/admin/challenges?event_id=${selectedEvent}`),
      adminApi.get(`/api/admin/categories?event_id=${selectedEvent}`),
    ]).then(([c, cat]) => {
      setChallenges(c.data);
      setCategories(cat.data);
    }).finally(() => setLoading(false));
  }, [selectedEvent]);

  const openCreate = () => {
    setForm({ ...emptyForm, event_id: selectedEvent });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (ch: Challenge) => {
    setForm({
      event_id: ch.event_id, category_id: ch.category_id ?? '',
      title: ch.title, description: ch.description ?? '',
      points: ch.points, difficulty: ch.difficulty,
      visible: ch.visible, max_attempts: ch.max_attempts?.toString() ?? '',
      flag: '', flag_format_regex: ch.challenge_flags?.flag_format_regex ?? '',
    });
    setEditing(ch);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        category_id: form.category_id || undefined,
        max_attempts: form.max_attempts ? Number(form.max_attempts) : null,
        flag: form.flag || undefined,
        flag_format_regex: form.flag_format_regex || undefined,
      };
      if (editing) {
        await adminApi.patch(`/api/admin/challenges/${editing.id}`, payload);
        toast.success('Challenge updated');
      } else {
        await adminApi.post('/api/admin/challenges', payload);
        toast.success('Challenge created');
      }
      setShowForm(false);
      adminApi.get(`/api/admin/challenges?event_id=${selectedEvent}`).then(r => setChallenges(r.data));
    } catch (err: any) {
      let msg = 'Failed to save challenge';
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

  const toggleVisible = async (ch: Challenge) => {
    await adminApi.patch(`/api/admin/challenges/${ch.id}`, { visible: !ch.visible });
    setChallenges(prev => prev.map(c => c.id === ch.id ? { ...c, visible: !c.visible } : c));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this challenge? This cannot be undone.')) return;
    await adminApi.delete(`/api/admin/challenges/${id}`);
    setChallenges(prev => prev.filter(c => c.id !== id));
    toast.success('Challenge deleted');
  };

  const addCategory = async () => {
    if (!newCategoryName.trim() || !selectedEvent) return;
    try {
      const res = await adminApi.post('/api/admin/categories', { event_id: selectedEvent, name: newCategoryName.trim() });
      setCategories(prev => [...prev, res.data]);
      setNewCategoryName('');
      toast.success('Category added');
    } catch { toast.error('Category already exists or failed'); }
  };

  const difficultyColors = { easy: 'var(--color-easy)', medium: 'var(--color-medium)', hard: 'var(--color-hard)' };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Challenges</h1>
            <select
              className="form-select"
              style={{ marginTop: '8px', width: '220px' }}
              value={selectedEvent}
              onChange={e => {
                setSelectedEvent(e.target.value);
                setSearchParams({ event_id: e.target.value });
              }}
            >
              <option value="">Select event...</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
          <button className="btn btn--outline" style={{ borderColor: 'var(--color-purple)', color: 'var(--color-purple)' }} onClick={openCreate} disabled={!selectedEvent}>
            <Plus size={15} /> New Challenge
          </button>
        </div>

        {/* Category management strip */}
        {selectedEvent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>Categories:</span>
            {categories.map(cat => (
              <span key={cat.id} className="badge badge--cyan">{cat.name}</span>
            ))}
            <input type="text" className="form-input" placeholder="New category" value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              style={{ width: 160, padding: '4px 10px', fontSize: '0.8rem' }} />
            <button className="btn btn--sm btn--ghost" onClick={addCategory}><Plus size={12} /></button>
          </div>
        )}

        {/* Challenge table */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Difficulty</th>
                <th>Points</th>
                <th>Flag Set</th>
                <th>Visible</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>Loading...</td></tr>
              ) : challenges.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>No challenges yet</td></tr>
              ) : challenges.map(ch => (
                <tr key={ch.id}>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{ch.title}</td>
                  <td><span className="badge badge--cyan">{ch.categories?.name ?? '—'}</span></td>
                  <td><span style={{ color: difficultyColors[ch.difficulty], fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{ch.difficulty}</span></td>
                  <td style={{ color: 'var(--color-neon)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{ch.points}</td>
                  <td>
                    <span style={{ color: ch.challenge_flags ? 'var(--color-easy)' : 'var(--color-red)', fontSize: '0.8rem' }}>
                      {ch.challenge_flags ? '✓ Set' : '✗ Missing'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn--sm btn--ghost" onClick={() => toggleVisible(ch)}>
                      {ch.visible ? <Eye size={13} color="var(--color-neon)" /> : <EyeOff size={13} />}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn--sm btn--ghost" onClick={() => openEdit(ch)}><Edit2 size={13} /></button>
                      <button className="btn btn--sm btn--ghost" style={{ color: 'var(--color-red)' }} onClick={() => handleDelete(ch.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create/Edit Modal */}
        {showForm && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 680 }}>
              <button className="modal__close" onClick={() => setShowForm(false)}><X size={18} /></button>
              <h2 style={{ marginBottom: 'var(--space-6)', fontSize: '1.1rem', color: 'var(--color-purple)' }}>
                {editing ? 'Edit Challenge' : 'New Challenge'}
              </h2>
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input type="text" className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={5} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
                      <option value="">None</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Difficulty</label>
                    <select className="form-select" value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value as any }))}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Points</label>
                    <input type="number" className="form-input" value={form.points} onChange={e => setForm(p => ({ ...p, points: Number(e.target.value) }))} min={1} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max Attempts (blank=unlimited)</label>
                    <input type="number" className="form-input" value={form.max_attempts} onChange={e => setForm(p => ({ ...p, max_attempts: e.target.value }))} min={1} placeholder="Unlimited" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <Flag size={12} style={{ display: 'inline', marginRight: '6px' }} />
                    Flag {editing ? '(leave blank to keep current)' : ''}
                  </label>
                  <input type="text" className="form-input" value={form.flag}
                    onChange={e => setForm(p => ({ ...p, flag: e.target.value }))}
                    placeholder="CTF{your_flag_here}"
                    autoComplete="off" autoCorrect="off" spellCheck={false}
                    required={!editing} />
                </div>
                <div className="form-group">
                  <label className="form-label">Flag Format Hint (regex, shown to players)</label>
                  <input type="text" className="form-input" value={form.flag_format_regex}
                    onChange={e => setForm(p => ({ ...p, flag_format_regex: e.target.value }))}
                    placeholder="^CTF\{.+\}$" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.visible} onChange={e => setForm(p => ({ ...p, visible: e.target.checked }))} />
                  Visible to players immediately
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button type="submit" className={`btn ${saving ? 'btn--loading' : ''}`}
                    style={{ background: 'var(--color-purple)', color: '#fff', border: '1px solid var(--color-purple)' }} disabled={saving}>
                    {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Challenge')}
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
