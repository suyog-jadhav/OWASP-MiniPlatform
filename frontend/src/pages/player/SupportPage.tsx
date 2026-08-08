import { useState, useEffect } from 'react';
import { MessageSquare, Send, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import Navbar from '../../components/player/Navbar';
import { formatDistanceToNow } from 'date-fns';

interface TicketReply {
  id: string;
  sender_type: 'player' | 'admin';
  message: string;
  created_at: string;
}

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  created_at: string;
  resolved_at: string | null;
  ticket_replies: TicketReply[];
}

export default function SupportPage() {
  const { eventId } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const [newTicket, setNewTicket] = useState({ subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchTickets = async () => {
    try {
      const res = await api.get('/api/support/tickets');
      setTickets(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.subject.trim() || !newTicket.message.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/api/support/tickets', {
        event_id: eventId,
        subject: newTicket.subject,
        message: newTicket.message,
      });
      toast.success('Ticket submitted');
      setNewTicket({ subject: '', message: '' });
      setShowNewForm(false);
      fetchTickets();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to submit ticket');
    } finally { setSubmitting(false); }
  };

  const handleReply = async (ticketId: string) => {
    const msg = replyText[ticketId]?.trim();
    if (!msg) return;
    try {
      await api.post(`/api/support/tickets/${ticketId}/reply`, { message: msg });
      setReplyText(prev => ({ ...prev, [ticketId]: '' }));
      fetchTickets();
    } catch { toast.error('Failed to send reply'); }
  };

  const statusColor = {
    open: 'var(--color-neon)',
    in_progress: 'var(--color-amber)',
    closed: 'var(--color-text-muted)',
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <div className="container" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-neon)' }}>// Support</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Submit and track support tickets</p>
          </div>
          <button className="btn btn--outline" onClick={() => setShowNewForm(!showNewForm)}>
            <Plus size={15} /> New Ticket
          </button>
        </div>

        {/* New ticket form */}
        {showNewForm && (
          <div className="card card--glow" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ marginBottom: 'var(--space-5)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
              New Support Ticket
            </h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Brief description of your issue"
                  value={newTicket.subject}
                  onChange={e => setNewTicket(p => ({ ...p, subject: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-textarea"
                  placeholder="Describe your issue in detail..."
                  value={newTicket.message}
                  onChange={e => setNewTicket(p => ({ ...p, message: e.target.value }))}
                  required
                  rows={5}
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button type="submit" className={`btn btn--primary ${submitting ? 'btn--loading' : ''}`} disabled={submitting}>
                  {!submitting && <Send size={14} />}
                  Submit Ticket
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setShowNewForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Ticket list */}
        {loading ? (
          <div className="empty-state"><div className="terminal-loader">Loading tickets...</div></div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={48} />
            <p>No tickets yet. Create one if you need help.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {tickets.map(ticket => (
              <div key={ticket.id} className="card">
                {/* Ticket header */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span className="status-dot" style={{ background: statusColor[ticket.status], boxShadow: `0 0 6px ${statusColor[ticket.status]}` }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ticket.subject}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px', marginLeft: '20px' }}>
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })} · {ticket.status.replace('_', ' ')} · {ticket.ticket_replies.length} replies
                    </div>
                  </div>
                  {expandedTicket === ticket.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {/* Expanded thread */}
                {expandedTicket === ticket.id && (
                  <div style={{ marginTop: 'var(--space-5)' }}>
                    <div className="divider" />
                    {/* Original message */}
                    <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', borderLeft: '2px solid var(--color-border-glow)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>You · Original message</div>
                      <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{ticket.message}</p>
                    </div>

                    {/* Replies */}
                    {ticket.ticket_replies.map(reply => (
                      <div key={reply.id} style={{
                        padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)',
                        background: reply.sender_type === 'admin' ? 'rgba(0,229,255,0.05)' : 'var(--color-bg-surface)',
                        borderLeft: `2px solid ${reply.sender_type === 'admin' ? 'var(--color-cyan)' : 'var(--color-border)'}`,
                      }}>
                        <div style={{ fontSize: '0.7rem', color: reply.sender_type === 'admin' ? 'var(--color-cyan)' : 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                          {reply.sender_type === 'admin' ? '⚡ Admin' : 'You'} · {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                      </div>
                    ))}

                    {/* Reply form */}
                    {ticket.status !== 'closed' && (
                      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Type a reply..."
                          value={replyText[ticket.id] ?? ''}
                          onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleReply(ticket.id)}
                        />
                        <button className="btn btn--outline" onClick={() => handleReply(ticket.id)}>
                          <Send size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
