import { useState, useEffect } from 'react';
import { Send, ChevronDown, ChevronUp, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../lib/api';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { formatDistanceToNow } from 'date-fns';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  created_at: string;
  players: { name: string; email: string } | null;
  ticket_replies: Array<{ id: string; sender_type: string; message: string; created_at: string }>;
}

export default function SupportInbox() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get(`/api/admin/support/tickets?status=${statusFilter}`);
      setTickets(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTickets(); }, [statusFilter]);

  const sendReply = async (ticketId: string) => {
    const msg = replyText[ticketId]?.trim();
    if (!msg) return;
    try {
      await adminApi.post(`/api/admin/support/tickets/${ticketId}/reply`, { message: msg });
      setReplyText(prev => ({ ...prev, [ticketId]: '' }));
      toast.success('Reply sent');
      fetchTickets();
    } catch { toast.error('Failed to send reply'); }
  };

  const closeTicket = async (ticketId: string) => {
    await adminApi.patch(`/api/admin/support/tickets/${ticketId}`, { status: 'closed' });
    toast.success('Ticket closed');
    fetchTickets();
  };

  const statusColors = { open: 'var(--color-neon)', in_progress: 'var(--color-amber)', closed: 'var(--color-text-muted)' };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-purple)' }}>// Support Inbox</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{tickets.length} {statusFilter} ticket{tickets.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {['open', 'in_progress', 'closed'].map(s => (
              <button key={s} className={`btn btn--sm ${statusFilter === s ? 'btn--outline' : 'btn--ghost'}`}
                style={statusFilter === s ? { borderColor: 'var(--color-purple)', color: 'var(--color-purple)' } : {}}
                onClick={() => setStatusFilter(s)}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="terminal-loader">Loading tickets...</div></div>
        ) : tickets.length === 0 ? (
          <div className="empty-state"><p>No {statusFilter.replace('_', ' ')} tickets</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {tickets.map(ticket => (
              <div key={ticket.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                  onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span className="status-dot" style={{ background: statusColors[ticket.status], boxShadow: `0 0 6px ${statusColors[ticket.status]}` }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ticket.subject}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px', marginLeft: '20px' }}>
                      {ticket.players?.name ?? 'Unknown'} ({ticket.players?.email}) · {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })} · {ticket.ticket_replies.length} replies
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {ticket.status !== 'closed' && (
                      <button className="btn btn--sm btn--ghost" style={{ color: 'var(--color-easy)' }}
                        onClick={e => { e.stopPropagation(); closeTicket(ticket.id); }}>
                        <Check size={12} /> Close
                      </button>
                    )}
                    {expandedTicket === ticket.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {expandedTicket === ticket.id && (
                  <div style={{ marginTop: 'var(--space-5)' }}>
                    <div className="divider" />
                    <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', borderLeft: '2px solid var(--color-border-glow)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                        {ticket.players?.name} · Original
                      </div>
                      <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{ticket.message}</p>
                    </div>

                    {ticket.ticket_replies.map(reply => (
                      <div key={reply.id} style={{
                        padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)',
                        background: reply.sender_type === 'admin' ? 'rgba(124,58,237,0.08)' : 'var(--color-bg-surface)',
                        borderLeft: `2px solid ${reply.sender_type === 'admin' ? 'var(--color-purple)' : 'var(--color-border)'}`,
                      }}>
                        <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', marginBottom: '8px', color: reply.sender_type === 'admin' ? 'var(--color-purple)' : 'var(--color-text-muted)' }}>
                          {reply.sender_type === 'admin' ? '⚡ You (Admin)' : ticket.players?.name} · {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                      </div>
                    ))}

                    {ticket.status !== 'closed' && (
                      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                        <input type="text" className="form-input" placeholder="Type a reply..."
                          value={replyText[ticket.id] ?? ''}
                          onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && sendReply(ticket.id)} />
                        <button className="btn btn--outline" style={{ borderColor: 'var(--color-purple)', color: 'var(--color-purple)' }} onClick={() => sendReply(ticket.id)}>
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
      </main>
    </div>
  );
}
