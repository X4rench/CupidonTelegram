// ═══════════════════════════════════════════════════════════════
// SimulatorResultScreen — разбор симуляции после /simulator/finish.
// Route: /simulator/result/:id?key=sim_session_<...>
//
// Показывает: score (0-10) круговая шкала, strengths, improvements,
// summary + tip. CTA: «Ещё попытка» (→ /simulator) и «Главная» (→ /).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { finishSimulator, ApiError } from '../api';
import { useBackButton } from '../utils/backButton';
import { notificationHaptic } from '../utils/haptics';

interface SimResult {
  score: number;
  summary?: string;
  tip?: string;
  strengths?: string[];
  improvements?: string[];
}

export function SimulatorResultScreen() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const sessionId = id ? decodeURIComponent(id) : '';

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SimResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useBackButton(() => nav(-1));

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setErr('Нет session_id');
      return;
    }
    finishSimulator({ sessionId })
      .then(res => {
        setResult(res.result as SimResult);
        if (res.result) notificationHaptic('success');
      })
      .catch(e => {
        if (e instanceof ApiError && e.status === 429 && e.code === 'LIMIT_EXCEEDED') {
          nav('/paywall');
          return;
        }
        setErr(e?.message || 'Не удалось получить разбор');
      })
      .finally(() => setLoading(false));
  }, [sessionId, nav]);

  if (loading) {
    return (
      <Layout>
        <div style={styles.loadingWrap}>
          <div style={styles.loadingIcon}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
              <circle cx={11} cy={11} r={8} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>Анализирую</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            AI готовит разбор твоего диалога
          </p>
          <Dots />
        </div>
      </Layout>
    );
  }

  if (err) {
    return (
      <Layout>
        <div style={{ padding: '24px 16px' }}>
          <Card style={{ borderColor: 'var(--status-negative)' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--status-negative)' }}>{err}</p>
          </Card>
          <div style={{ marginTop: 16 }}>
            <GradientButton onClick={() => nav('/simulator')} full>Назад в симулятор</GradientButton>
          </div>
        </div>
      </Layout>
    );
  }

  const score = result?.score ?? 0;
  const dashFill = Math.round((score / 10) * 339);
  const strengths = result?.strengths || [];
  const improvements = result?.improvements || [];

  return (
    <Layout>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={styles.header}>
          <button onClick={() => nav(-1)} style={styles.backBtn} aria-label="Назад">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={2.5} strokeLinecap="round">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Разбор</h1>
          <span style={{ width: 44 }} />
        </div>

        <Card style={{ alignItems: 'center', textAlign: 'center', paddingTop: 24, paddingBottom: 24, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 16 }}>
            <svg width={120} height={120} viewBox="0 0 120 120">
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F43F5E" />
                  <stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              <circle cx={60} cy={60} r={54} fill="none" stroke="var(--bg-elevated)" strokeWidth={8} />
              <circle
                cx={60} cy={60} r={54}
                fill="none"
                stroke="url(#scoreGrad)"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`${dashFill} 339`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div style={styles.scoreInner}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-accent)' }}>
                {result ? score.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 10</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: '20px' }}>
            {result?.summary || 'Диалог завершён.'}
          </div>
          {result?.tip && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-accent)' }}>{result.tip}</div>
          )}
        </Card>

        {(strengths.length > 0 || improvements.length > 0) && (
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {strengths.map((s, i) => (
              <div key={`s${i}`} style={styles.feedbackRow}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--status-positive)" strokeWidth={2}>
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                <span style={styles.feedbackText}>{s}</span>
              </div>
            ))}
            {improvements.map((s, i) => (
              <div key={`i${i}`} style={styles.feedbackRow}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth={2}>
                  <polygon points="12,2 2,22 22,22" />
                  <line x1={12} y1={9} x2={12} y2={14} />
                  <circle cx={12} cy={18} r={1} fill="var(--status-warning)" />
                </svg>
                <span style={styles.feedbackText}>{s}</span>
              </div>
            ))}
          </Card>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <SecondaryButton onClick={() => nav('/simulator')} full>Ещё попытка</SecondaryButton>
          </div>
          <div style={{ flex: 1 }}>
            <GradientButton onClick={() => nav('/')} full>Главная</GradientButton>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Dots() {
  return (
    <span style={{ display: 'inline-flex', gap: 6, marginTop: 8 }}>
      {[0, 1, 2].map(i => (
        <span key={i} className="resDot" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
      <style>{`
        .resDot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-accent); animation: resDot 0.84s ease-in-out infinite; opacity: 0.5; }
        @keyframes resDot { 0%, 100% { opacity: 0.3; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.15); } }
      `}</style>
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  loadingWrap: {
    minHeight: '70vh',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 16, padding: '0 32px',
  },
  loadingIcon: {
    width: 72, height: 72,
    borderRadius: 36,
    background: 'var(--gradient-accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    background: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.15))',
    border: '1px solid rgba(244,63,94,0.2)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  scoreInner: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  feedbackRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
  },
  feedbackText: {
    flex: 1, fontSize: 14, color: 'var(--text-secondary)', lineHeight: '21px',
  },
};
