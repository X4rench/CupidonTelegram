// ═══════════════════════════════════════════════════════════════
// ReferralScreen — реферальная программа.
//
// Маршрут: /referral
// Логика TMA-версии (отличается от RN):
//   - Реферальная ссылка строится через t.me/<BOT_USERNAME>/<MINIAPP_PATH>?startapp=ref_<tg_user_id>
//     (в TG-боте startapp прокидывается в WebApp как start_param).
//   - Поделиться — через WebApp.openTelegramLink('https://t.me/share/url?url=...')
//   - Fallback — navigator.clipboard.writeText + toast.
//
// Статистика рефералов пока не реализована на бэкенде (Phase H+).
// Показываем placeholder со счётчиками 0/0.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { getTgUser } from '../auth';

// Имя бота для построения реферальной ссылки.
// При желании можно вынести в env (VITE_BOT_USERNAME).
const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string) || 'CupidonAppBot';
const MINIAPP_SLUG = (import.meta.env.VITE_MINIAPP_SLUG as string) || 'app';

const STEPS = [
  {
    title: 'Поделись ссылкой',
    sub: 'Отправь её другу в Telegram или скопируй в любое место.',
  },
  {
    title: 'Друг открывает Купидон',
    sub: 'Запускает мини-приложение через твою ссылку — мы автоматически связываем вас.',
  },
  {
    title: 'Оба получаете бонусы',
    sub: 'Когда друг оформит подписку — тебе начислится бонус, а ему — скидка.',
  },
];

export function ReferralScreen() {
  const nav = useNavigate();
  const { me } = useMe();
  const [toast, setToast] = useState<string | null>(null);

  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const tgUserId = me?.telegram_user_id ?? getTgUser()?.id ?? null;

  const referralLink = useMemo(() => {
    if (!tgUserId) return '';
    return `https://t.me/${BOT_USERNAME}/${MINIAPP_SLUG}?startapp=ref_${tgUserId}`;
  }, [tgUserId]);

  const referralCode = useMemo(() => {
    if (!tgUserId) return '...';
    // Короткий читаемый код для отображения. Полная привязка — через tg_user_id.
    return `REF${String(tgUserId).slice(-6).padStart(6, '0').toUpperCase()}`;
  }, [tgUserId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const copyLink = useCallback(async () => {
    if (!referralLink) return;
    impactHaptic('light');
    try {
      await navigator.clipboard.writeText(referralLink);
      notificationHaptic('success');
      showToast('Ссылка скопирована');
    } catch (_) {
      // fallback на TG: пусть просто покажет share-диалог
      shareLink();
    }
  }, [referralLink, showToast]);

  const shareLink = useCallback(() => {
    if (!referralLink) return;
    impactHaptic('medium');
    const tg = (window as any)?.Telegram?.WebApp;
    const shareText = 'Купидон — AI-тренер для уверенного общения. Заходи!';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

    if (tg?.openTelegramLink) {
      try {
        tg.openTelegramLink(shareUrl);
        return;
      } catch (_) {/* fallthrough */}
    }
    // Fallback (вне TG) — попытаться скопировать
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink).then(
        () => showToast('Ссылка скопирована'),
        () => showToast('Не удалось поделиться'),
      );
    } else {
      showToast('Не удалось поделиться');
    }
  }, [referralLink, showToast]);

  // Статистика — placeholder пока бэкенд не реализован
  const stats = { invited: 0, earned: 0 };

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
        <span style={styles.headerTitle}>Пригласить друзей</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.heroIcon}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth={2} strokeLinecap="round">
            <circle cx={18} cy={5} r={3} />
            <circle cx={6} cy={12} r={3} />
            <circle cx={18} cy={19} r={3} />
            <line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
            <line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
          </svg>
        </div>
        <h1 style={styles.heroTitle}>Получи бонусы за друзей</h1>
        <p style={styles.heroSub}>
          Каждый друг, который оформит подписку, приносит тебе бонус — а ему скидку.
        </p>
      </div>

      {/* Ссылка */}
      <div style={styles.section}>
        <span style={styles.sectionTitle}>Твоя реферальная ссылка</span>
        <button onClick={copyLink} style={styles.codeBox}>
          <span style={styles.codeText}>{referralCode}</span>
          <div style={styles.copyChip}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                 stroke="var(--accent-primary)" strokeWidth={2}>
              <rect x={9} y={9} width={13} height={13} rx={2} />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <span>Копировать</span>
          </div>
        </button>

        <button onClick={shareLink} style={styles.shareBtn}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth={2} strokeLinecap="round">
            <circle cx={18} cy={5} r={3} />
            <circle cx={6} cy={12} r={3} />
            <circle cx={18} cy={19} r={3} />
            <line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
            <line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
          </svg>
          Поделиться
        </button>
      </div>

      {/* Стата */}
      <div style={styles.statsRow}>
        <StatTile label="Приглашено" value={stats.invited} />
        <StatTile label="Заработано ⭐" value={stats.earned} accent />
      </div>

      {/* Как работает */}
      <div style={styles.section}>
        <span style={styles.sectionTitle}>Как это работает</span>
        <div style={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={i} style={styles.step}>
              <div style={styles.stepNum}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={styles.stepTitle}>{s.title}</div>
                <div style={styles.stepSub}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Подсказка */}
      <div style={styles.hint}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
             stroke="var(--text-accent)" strokeWidth={2}>
          <circle cx={12} cy={12} r={10} />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
        <span>
          Реферальные начисления применяются автоматически при оформлении подписки другом.
          Статистика обновляется в течение нескольких минут.
        </span>
      </div>

      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      ...styles.statTile,
      borderColor: accent ? 'var(--border-accent)' : 'var(--border-subtle)',
      background: accent ? 'var(--accent-soft)' : 'var(--bg-card)',
    }}>
      <div style={{
        fontSize: 24, fontWeight: 700,
        color: accent ? 'var(--text-accent)' : 'var(--text-primary)',
      }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'var(--safe-top)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px',
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

  hero: {
    margin: '16px 16px 8px',
    padding: 20,
    borderRadius: 20,
    border: '1px solid var(--border-accent)',
    background: 'var(--accent-soft)',
    textAlign: 'center',
  },
  heroIcon: {
    width: 60, height: 60, borderRadius: 30,
    background: 'var(--gradient-accent)',
    margin: '0 auto 12px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'var(--glow-accent)',
  },
  heroTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' },
  heroSub:   { margin: '8px auto 0', maxWidth: 300, fontSize: 13, lineHeight: '19px', color: 'var(--text-secondary)' },

  section: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },

  codeBox: {
    width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
    borderRadius: 16,
    border: '1px solid var(--border-accent)',
    background: 'var(--bg-card)',
    cursor: 'pointer',
  },
  codeText: {
    fontSize: 20, fontWeight: 800,
    letterSpacing: 2,
    color: 'var(--text-accent)',
  },
  copyChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px',
    fontSize: 12, fontWeight: 600,
    color: 'var(--accent-primary)',
    background: 'var(--accent-soft)',
    borderRadius: 8,
  },
  shareBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%',
    padding: '14px 16px', minHeight: 48,
    borderRadius: 12,
    background: 'var(--gradient-accent)',
    color: '#fff',
    fontSize: 15, fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },

  statsRow: {
    margin: '8px 16px',
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
  },
  statTile: {
    padding: 16,
    borderRadius: 16,
    border: '1px solid',
    textAlign: 'center' as const,
  },

  steps: { display: 'flex', flexDirection: 'column', gap: 12 },
  step: {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: 14, borderRadius: 14,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
  },
  stepNum: {
    width: 32, height: 32, borderRadius: 16,
    background: 'var(--gradient-accent)',
    color: '#fff', fontSize: 14, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 },
  stepSub:   { fontSize: 12, lineHeight: '18px', color: 'var(--text-muted)' },

  hint: {
    margin: '0 16px',
    padding: 14,
    display: 'flex', gap: 10, alignItems: 'flex-start',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
    fontSize: 13, lineHeight: '19px', color: 'var(--text-secondary)',
  },

  toast: {
    position: 'fixed',
    left: 16, right: 16,
    bottom: 'calc(var(--safe-bottom) + 16px)',
    padding: '12px 16px',
    borderRadius: 12,
    color: '#fff',
    fontSize: 14, fontWeight: 600,
    textAlign: 'center',
    background: 'var(--status-positive)',
    zIndex: 100,
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
  },
};

export default ReferralScreen;
