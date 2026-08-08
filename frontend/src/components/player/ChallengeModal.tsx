import { useState, useEffect } from 'react';
import { CheckCircle, Lock, FileText, Link as LinkIcon, Image, ThumbsUp, ThumbsDown, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

interface ChallengeFile {
  id: string;
  file_type: 'file' | 'url' | 'image';
  label: string;
  external_url?: string;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category_name: string;
  max_attempts: number | null;
  files: ChallengeFile[];
  solved?: boolean;
}

interface Props {
  challenge: Challenge;
  onClose: () => void;
  onSolved: (challengeId: string, points: number) => void;
  attemptCount?: number;
}

export default function ChallengeModal({ challenge, onClose, onSolved, attemptCount = 0 }: Props) {
  const { playerId } = useAuthStore();
  const [flagValue, setFlagValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null);
  const [localAttempts, setLocalAttempts] = useState(attemptCount);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagValue.trim() || submitting || challenge.solved) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await api.post('/api/submissions', {
        challenge_id: challenge.id,
        value: flagValue,
      });

      if (res.data.correct) {
        setFeedback({ type: 'success', message: `Correct! +${res.data.points_awarded} pts` });
        onSolved(challenge.id, res.data.points_awarded);
        toast.success(`Flag accepted! +${res.data.points_awarded} points`, { icon: '🚩' });
      } else {
        setFeedback({ type: 'error', message: 'Incorrect flag. Try again.' });
        setLocalAttempts(prev => prev + 1);
        setFlagValue('');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Submission failed';
      if (err.response?.status === 429) {
        setFeedback({ type: 'error', message: 'Slow down — wait before submitting again.' });
      } else {
        setFeedback({ type: 'error', message: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReaction = async (r: 'like' | 'dislike') => {
    try {
      await api.post('/api/challenge-reactions', { challenge_id: challenge.id, reaction: r });
      setReaction(r);
    } catch {
      toast.error('Failed to save reaction');
    }
  };

  const handleFileDownload = async (file: ChallengeFile) => {
    if (file.file_type === 'url' && file.external_url) {
      window.open(file.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const res = await api.get(`/api/challenges/${challenge.id}/file/${file.id}`);
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Failed to get download link');
    }
  };

  const attemptsLeft = challenge.max_attempts != null
    ? challenge.max_attempts - localAttempts
    : null;

  const difficultyColors = {
    easy: 'var(--color-easy)',
    medium: 'var(--color-medium)',
    hard: 'var(--color-hard)',
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <span className={`badge badge--${challenge.difficulty}`}>{challenge.difficulty}</span>
            <span className="badge badge--cyan">{challenge.category_name}</span>
            {challenge.solved && (
              <span className="solved-badge">
                <CheckCircle size={14} /> SOLVED
              </span>
            )}
          </div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
            {challenge.title}
          </h2>
          <div style={{
            fontSize: '1.75rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: difficultyColors[challenge.difficulty],
            marginTop: 'var(--space-1)',
          }}>
            {challenge.points} pts
          </div>
        </div>

        {/* Description */}
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
          fontSize: '0.9rem',
          whiteSpace: 'pre-wrap',
        }}>
          {challenge.description || 'No description provided.'}
        </div>

        {/* Files */}
        {challenge.files?.length > 0 && (
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-label" style={{ marginBottom: 'var(--space-3)' }}>Attachments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {challenge.files.map(file => (
                <button
                  key={file.id}
                  className="btn btn--ghost"
                  onClick={() => handleFileDownload(file)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  {file.file_type === 'url' ? <LinkIcon size={14} /> :
                   file.file_type === 'image' ? <Image size={14} /> :
                   <FileText size={14} />}
                  {file.label || file.file_type}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Flag submission */}
        {!challenge.solved ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label">Submit Flag</label>
              <div className="flag-input-wrapper">
                <input
                  id={`flag-input-${challenge.id}`}
                  type="text"
                  className="form-input"
                  placeholder="CTF{...}"
                  value={flagValue}
                  onChange={e => setFlagValue(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={submitting || attemptsLeft === 0}
                />
                <button
                  type="submit"
                  className="flag-submit-btn"
                  disabled={!flagValue.trim() || submitting || attemptsLeft === 0}
                >
                  {submitting ? '...' : 'SUBMIT'}
                </button>
              </div>
            </div>

            {attemptsLeft !== null && (
              <p style={{ fontSize: '0.75rem', color: attemptsLeft <= 2 ? 'var(--color-red)' : 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 'var(--space-3)' }}>
                {attemptsLeft === 0 ? '⚠ No attempts remaining' : `${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining`}
              </p>
            )}

            {feedback && (
              <div className={`alert ${feedback.type === 'success' ? 'alert--success' : 'alert--error'}`}
                style={{ marginBottom: 'var(--space-4)' }}>
                {feedback.type === 'success' ? <CheckCircle size={16} /> : <Lock size={16} />}
                {feedback.message}
              </div>
            )}
          </form>
        ) : (
          <div className="alert alert--success" style={{ marginBottom: 'var(--space-4)' }}>
            <CheckCircle size={16} />
            Challenge solved! Great work.
          </div>
        )}

        {/* Reactions */}
        <div className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            Rate this challenge:
          </span>
          <button
            className={`btn btn--sm ${reaction === 'like' ? 'btn--outline' : 'btn--ghost'}`}
            onClick={() => handleReaction('like')}
            id={`reaction-like-${challenge.id}`}
          >
            <ThumbsUp size={13} /> Like
          </button>
          <button
            className={`btn btn--sm ${reaction === 'dislike' ? 'btn--danger' : 'btn--ghost'}`}
            onClick={() => handleReaction('dislike')}
            id={`reaction-dislike-${challenge.id}`}
          >
            <ThumbsDown size={13} /> Dislike
          </button>
        </div>
      </div>
    </div>
  );
}
