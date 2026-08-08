import { useState, useEffect } from 'react';
import { CheckCircle, Lock, Megaphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import ChallengeModal from '../../components/player/ChallengeModal';
import Navbar from '../../components/player/Navbar';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface Challenge {
  id: string;
  title: string;
  description: string;
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category_name: string;
  category_id: string;
  max_attempts: number | null;
  files: any[];
  solved?: boolean;
}

export default function ChallengePage() {
  const { eventId, playerId } = useAuthStore();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    if (!eventId) return;

    const fetchChallenges = async () => {
      try {
        const res = await api.get('/api/challenges');
        setChallenges(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error ?? 'Failed to load challenges');
      } finally {
        setLoading(false);
      }
    };

    const fetchAnnouncements = async () => {
      try {
        const res = await api.get(`/api/announcements/${eventId}`);
        setAnnouncements(res.data);
      } catch { /* ignore */ }
    };

    fetchChallenges();
    fetchAnnouncements();

    // Supabase Realtime subscription for live announcements
    const channel = supabase
      .channel(`announcements:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements', filter: `event_id=eq.${eventId}` },
        (payload) => {
          setAnnouncements(prev => [payload.new, ...prev]);
          toast.success('New announcement broadcasted!', { icon: '📢' });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const handleSolved = (challengeId: string) => {
    setSolvedIds(prev => new Set([...prev, challengeId]));
    setChallenges(prev =>
      prev.map(c => c.id === challengeId ? { ...c, solved: true } : c)
    );
  };

  // Group by category
  const filtered = filterDifficulty === 'all'
    ? challenges
    : challenges.filter(c => c.difficulty === filterDifficulty);

  const categories = Array.from(new Set(filtered.map(c => c.category_name))).sort();

  const solvedCount = challenges.filter(c => solvedIds.has(c.id) || c.solved).length;
  const totalPoints = challenges
    .filter(c => solvedIds.has(c.id) || c.solved)
    .reduce((sum, c) => sum + c.points, 0);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      <div className="container" style={{ paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
        {/* Announcements Banner */}
        {announcements.length > 0 && (
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-cyan)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Megaphone size={14} /> // ANNOUNCEMENTS
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {announcements.slice(0, 3).map(a => (
                <div key={a.id} className="announcement">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                  <p style={{ color: 'var(--color-text-primary)', fontSize: '0.9rem' }}>{a.message}</p>
                </div>
              ))}
            </div>
            <div className="divider" />
          </div>
        )}

        {/* Stats bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 'var(--space-8)', flexWrap: 'wrap', gap: 'var(--space-4)',
        }}>
          <div>
            <h1 style={{ color: 'var(--color-neon)', marginBottom: '4px' }}>// Challenges</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {solvedCount}/{challenges.length} solved · {totalPoints} pts earned
            </p>
          </div>

          {/* Difficulty filter */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {['all', 'easy', 'medium', 'hard'].map(d => (
              <button
                key={d}
                className={`btn btn--sm ${filterDifficulty === d ? 'btn--outline' : 'btn--ghost'}`}
                onClick={() => setFilterDifficulty(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="terminal-loader">Loading challenges...</div>
          </div>
        ) : error ? (
          <div className="alert alert--error">{error}</div>
        ) : challenges.length === 0 ? (
          <div className="empty-state">
            <Lock size={48} />
            <p>No challenges available yet.</p>
          </div>
        ) : (
          categories.map(category => {
            const catChallenges = filtered.filter(c => c.category_name === category);
            if (catChallenges.length === 0) return null;
            return (
              <div key={category} className="category-section">
                <div className="category-section__title">
                  {category}
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
                    {catChallenges.filter(c => solvedIds.has(c.id) || c.solved).length}/{catChallenges.length}
                  </span>
                </div>
                <div className="challenge-grid">
                  {catChallenges.map(challenge => {
                    const solved = solvedIds.has(challenge.id) || challenge.solved;
                    return (
                      <div
                        key={challenge.id}
                        className={`challenge-card ${solved ? 'challenge-card--solved' : ''}`}
                        onClick={() => setSelectedChallenge({ ...challenge, solved })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setSelectedChallenge({ ...challenge, solved })}
                      >
                        {/* Top row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                          <span className={`badge badge--${challenge.difficulty}`}>{challenge.difficulty}</span>
                          {solved && <CheckCircle size={16} color="var(--color-easy)" />}
                        </div>

                        <div className="challenge-card__points">{challenge.points}</div>
                        <div className="challenge-card__title">{challenge.title}</div>

                        <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {challenge.max_attempts != null ? `${challenge.max_attempts} attempts` : 'Unlimited'}
                          </span>
                          {challenge.files?.length > 0 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-cyan)' }}>
                              {challenge.files.length} file{challenge.files.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedChallenge && (
        <ChallengeModal
          challenge={selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          onSolved={handleSolved}
        />
      )}
    </div>
  );
}
