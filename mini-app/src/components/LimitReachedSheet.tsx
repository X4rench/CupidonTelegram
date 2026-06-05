// ═══════════════════════════════════════════════════════════════
// LimitReachedSheet — bottom-sheet баннер при исчерпании лимита.
//
// Открывается ВМЕСТО fullscreen paywall'а когда юзер уперся в дневной
// лимит. Показывает три опции апгрейда:
//   - Day Pass (за 99₽ +100 запросов и +50 сим-сообщений)
//   - Basic (если юзер на Free)
//   - Premium (если юзер на Free/Basic)
//
// Reason определяет заголовок и описание:
//   - 'limit'     — закончились общие запросы (Стрела/Разбор/Поддержка/etc)
//   - 'sim_limit' — закончились сообщения в симуляторе
// ═══════════════════════════════════════════════════════════════
import { useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { impactHaptic, selectionHaptic } from '../utils/haptics';

export type LimitReason = 'limit' | 'sim_limit';

interface Props {
  open: boolean;
  reason: LimitReason;
  onClose: () => void;
}

const RUB_DAY_PASS = parseInt(import.meta.env.VITE_RUB_PRICE_DAY_PASS || '99', 10) || 99;
const RUB_BASIC    = parseInt(import.meta.env.VITE_RUB_PRICE_BASIC    || '299', 10) || 299;
const RUB_PREMIUM  = parseInt(import.meta.env.VITE_RUB_PRICE_PREMIUM  || '899', 10) || 899;

export function LimitReachedSheet({ open, reason, onClose }: Props) {
  const nav = useNavigate();
  const { me } = useMe();
  const tier = me?.tier || 'free';

  // ESC / back-button → закрыть
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isSim = reason === 'sim_limit';
  const title = isSim
    ? 'Сообщения симулятора закончились'
    : 'Дневной лимит исчерпан';
  const subtitle = isSim
    ? `Ты использовал все сообщения с AI-девушкой за сегодня (${me?.sim_daily_used ?? '?'} / ${me?.sim_daily_limit ?? '?'}). Чтобы продолжить:`
    : `Использовано ${me?.daily_used ?? '?'} из ${me?.daily_limit ?? '?'} запросов. Чтобы продолжить:`;

  const goPaywall = (plan?: 'basic' | 'premium' | 'day_pass') => {
    impactHaptic('medium');
    onClose();
    nav('/paywall', { state: { reason: isSim ? 'sim_limit' : 'limit', defaultPlan: plan } });
  };

  return (
    <div style={styles.backdrop} onClick={() => { selectionHaptic(); onClose(); }}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.handle} />
        <div style={styles.title}>{title}</div>
        <div style={styles.subtitle}>{subtitle}</div>

        {/* Day Pass — всегда виден (юзер любого тира может докупить) */}
        <OptionBtn
          emoji="⚡"
          title={`Day Pass · ${RUB_DAY_PASS} ₽`}
          subtitle={isSim
            ? '+100 запросов и +50 сообщений симулятора'
            : '+100 запросов сразу'}
          accent
          onClick={() => goPaywall('day_pass')}
        />

        {/* Basic — только для Free */}
        {tier === 'free' && (
          <OptionBtn
            emoji="🔵"
            title={`Basic · ${RUB_BASIC} ₽/мес`}
            subtitle="30 запросов и 30 сообщений симулятора в день"
            onClick={() => goPaywall('basic')}
          />
        )}

        {/* Premium — для Free и Basic */}
        {(tier === 'free' || tier === 'basic') && (
          <OptionBtn
            emoji="⭐"
            title={`Premium · ${RUB_PREMIUM} ₽/мес`}
            subtitle="100 запросов и 60 сообщений симулятора + 18+ режимы"
            onClick={() => goPaywall('premium')}
          />
        )}

        <button onClick={onClose} style={styles.cancelBtn}>
          Понятно, позже
        </button>
      </div>
    </div>
  );
}

function OptionBtn({ emoji, title, subtitle, onClick, accent }: {
  emoji: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button onClick={onClick} style={accent ? styles.optionAccent : styles.option}>
      <span style={styles.optionEmoji}>{emoji}</span>
      <span style={styles.optionTextWrap}>
        <span style={styles.optionTitle}>{title}</span>
        <span style={styles.optionSubtitle}>{subtitle}</span>
      </span>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
           stroke={accent ? '#fff' : 'var(--text-muted)'} strokeWidth={2}>
        <polyline points="9,18 15,12 9,6" />
      </svg>
    </button>
  );
}

const baseOption: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 14px',
  borderRadius: 14,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 200,
    animation: 'fadeIn 200ms',
  },
  sheet: {
    width: '100%', maxWidth: 520,
    background: 'var(--bg-card)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: '14px 18px',
    paddingBottom: 'calc(18px + var(--safe-bottom))',
    display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: '0 -8px 28px rgba(0,0,0,0.4)',
  },
  handle: {
    width: 38, height: 4,
    background: 'var(--border-default)',
    borderRadius: 2,
    margin: '0 auto 4px',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: '18px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    marginBottom: 8,
  },
  option: baseOption,
  optionAccent: {
    ...baseOption,
    border: 'none',
    background: 'var(--gradient-accent)',
    color: '#fff',
    boxShadow: 'var(--glow-accent)',
  },
  optionEmoji: { fontSize: 22, flexShrink: 0 },
  optionTextWrap: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  optionTitle: { fontSize: 14, fontWeight: 700 },
  optionSubtitle: { fontSize: 11, opacity: 0.85, marginTop: 2 },
  cancelBtn: {
    marginTop: 4,
    padding: '10px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: 0,
    fontSize: 13,
    cursor: 'pointer',
  },
};
