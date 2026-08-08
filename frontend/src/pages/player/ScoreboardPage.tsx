import { useState, useEffect, useCallback } from 'react';
import { Trophy, Snowflake, EyeOff, Medal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import Navbar from '../../components/player/Navbar';
import { formatDistanceToNow } from 'date-fns';

interface ScoreEntry {
  player_id: string;
  total_points: number;
  challenges_solved: number;
  last_correct_at: string | null;
  players: { name: string } | null;
}

interface ScoreboardResponse {
  frozen: boolean;
  frozen_at: string | null;
  scores: ScoreEntry[];
}

export default function ScoreboardPage() {
  const { eventId, playerId } = useAuthStore();
  const [scoreboard, setScoreboard] = useState<ScoreboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  const fetchScoreboard = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await api.get(`/api/scoreboard/${eventId}`);
      setScoreboard(res.data);
      setHidden(false);
    } catch (err: any) {
      if (err.response?.status === 403) setHidden(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchScoreboard();

    // Supabase Realtime subscription on scoreboard_cache
    const channel = supabase
      .channel(`scoreboard:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_cache', filter: `event_id=eq.${eventId}` },
        () => { fetchScoreboard(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId, fetchScoreboard]);

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', class: 'scoreboard__rank--1' };
    if (rank === 2) return { emoji: '🥈', class: 'scoreboard__rank--2' };
    if (rank === 3) return { emoji: '🥉', class: 'scoreboard__rank--3' };
    return { emoji: String(rank), class: 'scoreboard__rank--n' };
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      <div className="container" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
        <div className="section-header">
          <div>
            <h1 style={{ color: 'var(--color-neon)' }}>// Scoreboard</h1>
            {scoreboard?.frozen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <Snowflake size={14} color="var(--color-cyan)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-cyan)' }}>
                  Frozen since {scoreboard.frozen_at
                    ? formatDistanceToNow(new Date(scoreboard.frozen_at), { addSuffix: true })
                    : '—'}
                </span>
              </div>
            )}
          </div>
          <Trophy size={28} color="var(--color-amber)" />
        </div>

        {loading ? (
          <div className="empty-state"><div className="terminal-loader">Loading scoreboard...</div></div>
        ) : hidden ? (
          <div className="card card--glow" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
            <EyeOff size={48} color="var(--color-text-muted)" style={{ marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--color-text-muted)' }}>Scoreboard Hidden</h3>
            <p>The scoreboard is currently not visible. Check back soon.</p>
          </div>
        ) : !scoreboard?.scores?.length ? (
          <div className="empty-state"><p>No scores yet. Be the first to solve a challenge!</p></div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr auto auto',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              <span>#</span>
              <span>Player</span>
              <span>Solved</span>
              <span>Points</span>
            </div>

            {scoreboard.scores.map((entry, index) => {
              const rank = index + 1;
              const { emoji, class: rankClass } = getRankDisplay(rank);
              const isMe = entry.player_id === playerId;

              return (
                <div
                  key={entry.player_id}
                  className={`scoreboard-row ${rank <= 3 ? 'scoreboard-row--top' : ''}`}
                  style={isMe ? {
                    background: 'linear-gradient(90deg, rgba(0,229,255,0.06), transparent)',
                    borderLeft: '2px solid var(--color-cyan)',
                  } : {}}
                >
                  <div className={`scoreboard__rank ${rankClass}`}>{emoji}</div>

                  <div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: isMe ? 'var(--color-cyan)' : 'var(--color-text-primary)',
                    }}>
                      {entry.players?.name ?? 'Anonymous'}
                      {isMe && <span style={{ marginLeft: '8px', fontSize: '0.65rem', color: 'var(--color-cyan)' }}>(you)</span>}
                    </div>
                    {entry.last_correct_at && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Last solve: {formatDistanceToNow(new Date(entry.last_correct_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
                    {entry.challenges_solved}
                  </div>

                  <div className="scoreboard__points">
                    {entry.total_points.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
