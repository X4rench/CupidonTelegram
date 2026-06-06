// ═══════════════════════════════════════════════════════════════
// ProfileScreen — таб-экран профиля.
// Содержит:
//   - Header с TG-аватаром, именем, тир-бейджем
//   - Карточку подписки (Free → CTA на /paywall)
//   - 2×2 grid статистики (requests / simulations / avg_score / days_in_app)
//   - Список ссылок: Promo, Referral, Settings, Support, Tutorial,
//     EditProfile, Terms, Privacy
//   - Секцию Админка (только если is_admin)
//
// Аватар — берётся из TG (photo_url), фоллбэк — инициал.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { useMe } from '../contexts/MeContext';
import { getStats } from '../api';
import { getTgUser } from '../auth';
import { selectionHaptic, impactHaptic } from '../utils/haptics';

interface StatRow {
  label: string;
  value: string;
}

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  premium: 'Premium',
};

export function ProfileScreen() {
  const nav = useNavigate();
  const { me } = useMe();
  const tgUser = getTgUser();

  const [stats, setStats] = useState<StatRow[]>([
    { label: 'Запросы', value: '0' },
    { label: 'Симуляции', value: '0' },
    { label: 'Средний балл', value: '—' },
    { label: 'Дней в приложении', value: '1' },
  ]);

  useEffect(() => {
    getStats()
      .then(res => {
        if (!res?.ok) return;
        const s = res.stats;
        setStats([
          { label: 'Запросы', value: String(s.requests ?? 0) },
          { label: 'Симуляции', value: String(s.simulations ?? 0) },
          { label: 'Средний балл', value: s.avg_score != null ? s.avg_score.toFixed(1) : '—' },
          { label: 'Дней в приложении', value: String(s.days_in_app ?? 1) },
        ]);
      })
      .catch(() => {});
  }, []);

  const tier = me?.tier ?? 'free';
  const tierLabel = TIER_LABEL[tier] ?? 'Free';
  const isFree = tier === 'free';
  const displayName =
    me?.user_profile?.name?.trim() ||
    [me?.first_name, me?.last_name].filter(Boolean).join(' ') ||
    'Пользователь';
  const username = me?.username ? `@${me.username}` : '';
  const avatarInitials = displayName.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('') || '?';

  // Список меню профиля.
  // ВНИМАНИЕ: пункта «Поддержка»/«Связаться» НЕТ — это AI-режим "Поддержи её"
  // на главной (карточка → /support). Здесь — только настройки/доки.
  // «Подписка» вынесена выше отдельной карточкой (см. Subscription CTA).
  const links: { label: string; to: string; icon: string; color?: string }[] = [
    { label: 'Промокод', to: '/promo', icon: 'gift' },
    // Рефералка пока отключена — оставлю в коде закомментированно, легко вернуть.
    // { label: 'Рефералка', to: '/referral', icon: 'users' },
    { label: 'Настройки', to: '/settings', icon: 'settings' },
    { label: 'Туториал', to: '/tutorial', icon: 'play' },
    { label: 'Условия использования', to: '/terms', icon: 'doc' },
    { label: 'Политика конфиденциальности', to: '/privacy', icon: 'shield' },
  ];

  return (
    <Layout withTabBar>
      <div style={{ padding: '16px 20px' }}>
        <h1 style={styles.title}>Профиль</h1>

        {/* Avatar + name */}
        <div style={styles.userRow}>
          <button
            onClick={() => { selectionHaptic(); nav('/edit-profile'); }}
            style={styles.avatarBtn}
            aria-label="Редактировать профиль"
          >
            {tgUser?.photo_url ? (
              <img src={tgUser.photo_url} alt="" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarFallback}>
                <span style={styles.avatarInitials}>{avatarInitials}</span>
              </div>
            )}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.nameRow}>
              <span style={styles.userName}>{displayName}</span>
              <span style={{
                ...styles.tierBadge,
                ...(isFree ? styles.tierBadgeFree : styles.tierBadgePaid),
              }}>
                {tierLabel}
              </span>
            </div>
            {username && <div style={styles.username}>{username}</div>}
          </div>
          <button
            onClick={() => { impactHaptic('light'); nav('/edit-profile'); }}
            style={styles.editBtn}
            aria-label="Редактировать"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={2}>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>

        {/* Subscription CTA — динамический в зависимости от тира.
            free → gradient "Купить подписку".
            basic/premium → secondary "Управление подпиской" + дата окончания. */}
        <Card
          accent
          style={{
            ...styles.subCard,
            backgroundImage: 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(168,85,247,0.08))',
          }}
        >
          <div style={styles.subHeader}>
            <div>
              <div style={styles.subLabel}>Подписка</div>
              <div style={styles.subRow}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="var(--accent-soft)" stroke="var(--text-accent)" strokeWidth={1.5}>
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                <span style={styles.subText}>
                  {isFree ? 'Бесплатный тариф' : `${tierLabel} активна${formatExpiresShort(me?.sub_expires_at) ? ` до ${formatExpiresShort(me?.sub_expires_at)}` : ''}`}
                </span>
              </div>
              {(me?.tg_bonus_quota ?? 0) > 0 && (
                <div style={{
                  marginTop: 6, fontSize: 12, fontWeight: 600,
                  color: 'var(--status-positive)',
                }}>
                  +{me?.tg_bonus_quota} запросов
                  {(me?.sim_bonus_quota ?? 0) > 0 && ` · +${me?.sim_bonus_quota} сим-сообщений`}
                  {me?.bonus_expires_at && (
                    <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--text-muted)' }}>
                      · {formatBonusExpiry(me.bonus_expires_at)}
                    </span>
                  )}
                </div>
              )}
            </div>
            {isFree && <span style={styles.noPlanBadge}>{tierLabel}</span>}
          </div>
          {isFree ? (
            <GradientButton
              full
              onClick={() => nav('/paywall')}
              style={{ minHeight: 40, padding: '10px 16px', fontSize: 13 }}
            >
              Купить подписку
            </GradientButton>
          ) : (
            <button
              onClick={() => { selectionHaptic(); nav('/paywall'); }}
              style={styles.manageSubBtn}
            >
              Управление подпиской
            </button>
          )}
        </Card>

        {/* Partner cabinet CTA — показываем только партнёрам */}
        {me?.is_partner && (
          <Card
            accent
            onClick={() => { selectionHaptic(); nav('/partner-cabinet'); }}
            style={{
              marginBottom: 16,
              backgroundImage: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(168,85,247,0.10))',
              borderColor: 'var(--border-accent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'var(--gradient-accent)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                fontSize: 20,
              }}>
                💼
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Кабинет партнёра
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Управляй рефералами и выплатами
                </div>
              </div>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </div>
          </Card>
        )}

        {/* Stats grid */}
        <SectionTitle>Статистика</SectionTitle>
        <div style={styles.statsGrid}>
          {stats.map((s, i) => (
            <Card key={i} style={styles.statCard}>
              <span style={styles.statLabel}>{s.label}</span>
              <span style={styles.statValue}>{s.value}</span>
            </Card>
          ))}
        </div>

        {/* Settings list */}
        <SectionTitle>Меню</SectionTitle>
        <div style={styles.menuList}>
          {links.map((item, i) => (
            <button
              key={item.to}
              onClick={() => { selectionHaptic(); nav(item.to); }}
              style={{
                ...styles.menuItem,
                ...(i === 0 ? styles.menuFirst : {}),
                ...(i === links.length - 1 ? styles.menuLast : {}),
                ...(i < links.length - 1 ? styles.menuBorder : {}),
              }}
            >
              <MenuIcon name={item.icon} />
              <span style={styles.menuLabel}>{item.label}</span>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>
          ))}
        </div>

        {/* Admin section */}
        {me?.is_admin && (
          <>
            <SectionTitle>Админка</SectionTitle>
            <div style={styles.menuList}>
              <button
                onClick={() => { selectionHaptic(); nav('/admin'); }}
                style={{ ...styles.menuItem, ...styles.menuFirst, ...styles.menuLast }}
              >
                <MenuIcon name="lock" />
                <span style={{ ...styles.menuLabel, color: 'var(--text-accent)' }}>Панель администратора</span>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={styles.sectionTitle}>{children}</h2>;
}

/** «через 23ч 45м» / «через 5м» / «сгорает скоро». Для Day Pass quota. */
function formatBonusExpiry(iso: string): string {
  // SQLite ISO без 'Z' — добавим если нет TZ
  const isoSafe = /[Zz]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z';
  const t = Date.parse(isoSafe);
  if (!Number.isFinite(t)) return '';
  const diffMin = Math.floor((t - Date.now()) / 60_000);
  if (diffMin <= 0) return 'сгорает...';
  if (diffMin < 60) return `сгорит через ${diffMin}м`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) return `сгорит через ${h}ч ${m}м`;
  return `сгорит через ${Math.floor(h / 24)}д`;
}

/** Дата окончания подписки → "DD.MM.YYYY" в локали ru-RU. null/invalid → '' */
function formatExpiresShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function MenuIcon({ name }: { name: string }) {
  const color = 'var(--text-secondary)';
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === 'star' && <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />}
      {name === 'gift' && <><polyline points="20,12 20,22 4,22 4,12" /><rect x={2} y={7} width={20} height={5} /><line x1={12} y1={22} x2={12} y2={7} /></>}
      {name === 'users' && (<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx={9} cy={7} r={4} /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>)}
      {name === 'settings' && (<><circle cx={12} cy={12} r={3} /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>)}
      {name === 'play' && <polygon points="5,3 19,12 5,21 5,3" />}
      {name === 'heart' && <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />}
      {name === 'doc' && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></>}
      {name === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
      {name === 'lock' && (<><rect x={3} y={11} width={18} height={11} rx={2} /><path d="M7 11V7a5 5 0 0110 0v4" /></>)}
    </svg>
  );
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },

  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  avatarBtn: {
    width: 64, height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    background: 'transparent',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarFallback: {
    width: '100%', height: '100%',
    background: 'var(--gradient-accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 22, fontWeight: 700 },

  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  userName: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  tierBadge: {
    fontSize: 11, fontWeight: 600,
    padding: '2px 8px', borderRadius: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tierBadgeFree: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
  },
  tierBadgePaid: {
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
  },
  username: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },

  editBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(244,63,94,0.12), rgba(168,85,247,0.12))',
    border: '1px solid rgba(244,63,94,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },

  subCard: { marginBottom: 16 },
  manageSubBtn: {
    width: '100%',
    minHeight: 40,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    cursor: 'pointer',
  },
  subHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  subLabel: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 },
  subRow: { display: 'flex', alignItems: 'center', gap: 6 },
  subText: { fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' },
  noPlanBadge: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    fontSize: 11, fontWeight: 600,
    padding: '4px 10px', borderRadius: 6,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  sectionTitle: {
    margin: '24px 0 12px',
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-muted)',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: { fontSize: 11, color: 'var(--text-muted)' },
  statValue: { fontSize: 22, fontWeight: 700, color: 'var(--text-accent)' },

  menuList: {
    borderRadius: 16,
    border: '1px solid var(--border-subtle)',
    overflow: 'hidden',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: 'var(--bg-card)',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
  },
  menuFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  menuLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  menuBorder: { borderBottom: '1px solid var(--border-subtle)' },
  menuLabel: { flex: 1, fontSize: 15, color: 'var(--text-primary)' },
};
