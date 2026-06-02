// ═══════════════════════════════════════════════════════════════
// PromoCodeScreen — ввод и применение промокода.
//
// Маршрут: /promo
// Бэкенд POST /promo/apply. Поддерживаемые типы:
//   - bonus_quota → applied.added (N бесплатных запросов)
//   - sub_trial   → applied.plan + applied.days (триал подписки)
//
// На success — useMe().refresh() чтобы тир/лимиты подтянулись.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackButton } from '../utils/backButton';
import { notificationHaptic, impactHaptic } from '../utils/haptics';
import { useMe } from '../contexts/MeContext';
import { applyPromo, type PromoApplyResponse } from '../api';

type Status = null | 'success' | 'error';

export function PromoCodeScreen() {
  const nav = useNavigate();
  const { refresh } = useMe();

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const handleApply = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setStatus(null);
    setMessage('');

    try {
      const res: PromoApplyResponse = await applyPromo(trimmed);
      if (res.ok) {
        notificationHaptic('success');
        await refresh();
        setStatus('success');

        const ap = res.applied;
        if (ap?.kind === 'sub_trial') {
          setMessage(`Активировано: ${ap.plan ?? 'basic'} на ${ap.days ?? 0} дн.`);
        } else if (ap?.kind === 'bonus_quota') {
          setMessage(`+${ap.added ?? 0} бесплатных запросов`);
        } else {
          setMessage('Промокод применён');
        }
      } else {
        notificationHaptic('error');
        setStatus('error');
        setMessage(res.error || 'Промокод не найден или уже использован');
      }
    } catch (e: any) {
      notificationHaptic('error');
      setStatus('error');
      setMessage(e?.message || 'Не удалось применить промокод');
    } finally {
      setLoading(false);
    }
  }, [code, loading, refresh]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn} aria-label="Назад">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)"
               strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <span style={styles.headerTitle}>Промокод</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={styles.content}>
        {/* Иконка */}
        <div style={styles.iconWrap}>
          <svg width={44} height={44} viewBox="0 0 24 24" fill="none"
               stroke="var(--text-accent)" strokeWidth={1.5}>
            <polyline points="20,12 20,22 4,22 4,12" />
            <rect x={2} y={7} width={20} height={5} />
            <path d="M12 22V7" />
            <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
          </svg>
        </div>

        <h1 style={styles.heading}>Введи промокод</h1>
        <p style={styles.sub}>Получи бонусные запросы или дни подписки.</p>

        {/* Input */}
        <div style={styles.inputCard}>
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setStatus(null); }}
            placeholder="CUPIDON10"
            autoCapitalize="characters"
            autoCorrect="off"
            style={styles.input}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
          />
        </div>

        {/* Status */}
        {status === 'success' && (
          <div style={{ ...styles.statusBox, ...styles.statusOk }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                 stroke="var(--status-positive)" strokeWidth={2}>
              <polyline points="20,6 9,17 4,12" />
            </svg>
            <span style={{ color: 'var(--status-positive)' }}>{message || 'Промокод применён'}</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ ...styles.statusBox, ...styles.statusErr }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                 stroke="var(--status-negative)" strokeWidth={2}>
              <circle cx={12} cy={12} r={10} />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <span style={{ color: 'var(--status-negative)' }}>{message}</span>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => { impactHaptic('light'); handleApply(); }}
          disabled={loading || !code.trim()}
          style={{
            ...styles.cta,
            opacity: (loading || !code.trim()) ? 0.5 : 1,
          }}
        >
          {loading ? 'Применяем…' : 'Применить'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'var(--safe-top)',
    paddingBottom: 'calc(var(--safe-bottom) + 32px)',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },

  content: {
    flex: 1,
    padding: 24,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
  },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    marginTop: 16,
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  heading: {
    margin: 0,
    fontSize: 22, fontWeight: 700,
    color: 'var(--text-primary)', textAlign: 'center',
  },
  sub: {
    margin: 0,
    fontSize: 14, lineHeight: '20px',
    color: 'var(--text-muted)', textAlign: 'center',
  },
  inputCard: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  input: {
    width: '100%',
    padding: '16px 20px',
    fontSize: 18, fontWeight: 700,
    letterSpacing: 2,
    textAlign: 'center',
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none', outline: 'none',
    textTransform: 'uppercase',
  },
  statusBox: {
    width: '100%',
    display: 'flex', alignItems: 'center', gap: 10,
    padding: 12,
    borderRadius: 12,
    border: '1px solid',
    fontSize: 13, lineHeight: '19px',
  },
  statusOk:  { background: 'rgba(34,197,94,0.10)',  borderColor: 'rgba(34,197,94,0.30)'  },
  statusErr: { background: 'rgba(239,68,68,0.10)',  borderColor: 'rgba(239,68,68,0.30)'  },

  cta: {
    marginTop: 8,
    width: '100%',
    padding: '14px 20px',
    minHeight: 48,
    borderRadius: 12,
    background: 'var(--gradient-accent)',
    color: '#fff',
    fontSize: 16, fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },
};

export default PromoCodeScreen;
