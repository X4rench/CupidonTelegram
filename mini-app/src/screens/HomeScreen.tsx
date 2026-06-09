// ═══════════════════════════════════════════════════════════════
// HomeScreen — главный экран после онбординга.
// Состоит из:
//   1. Header (приветствие + аватар → /profile)
//   2. Инструменты — горизонтальный скролл карточек (Wing, FirstMessage,
//      Rejection, Support, CreateGirl, Feed)
//   3. Активные диалоги — заглушка пока Phase F-G не портированы
//   4. Прогресс — реальные stats из /users/stats
//   5. Совет дня — статический контент
//
// Стили — inline через объект `styles` внизу файла.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { useMe } from '../contexts/MeContext';
import { contactsApi, getStats, type Contact } from '../api';
import { impactHaptic, selectionHaptic } from '../utils/haptics';
import { getTgUser } from '../auth';
import { getTipOfDay } from '../utils/dailyTips';
import { cleanTypazhName } from '../utils/typazhes';
import { DialogActionsMenu } from '../components/DialogActionsMenu';
import { deleteWingContact, deleteSimSession, cleanupEmptySimSessions } from '../utils/dialogActions';

interface QuickAction {
  key: string;
  name: string;
  to: string;
  iconColor: string;
  bg: string;
  icon: ReactNode;
}

const quickActions: QuickAction[] = [
  {
    key: 'wing', name: 'Стрела', to: '/wing',
    iconColor: '#F43F5E', bg: 'rgba(244,63,94,0.1)',
    icon: <path d="M5 19L19 5M19 5L19 12M19 5L12 5" />,
  },
  {
    key: 'first', name: 'Первое\nсообщение', to: '/first-message',
    iconColor: '#EC4899', bg: 'rgba(236,72,153,0.1)',
    icon: <><path d="M2 6h20v12H2z" /><path d="M2 9l10 6 10-6" /></>,
  },
  {
    key: 'rejection', name: 'Разбор\nотказа', to: '/rejection',
    iconColor: '#EF4444', bg: 'rgba(239,68,68,0.1)',
    icon: <><path d="M12 4C12 4 16 6 16 10C16 14 12 18 12 18C12 18 8 14 8 10C8 6 12 4 12 4Z" /><line x1={8} y1={20} x2={16} y2={20} /></>,
  },
  {
    key: 'support', name: 'Поддержи\nеё', to: '/support',
    iconColor: '#A855F7', bg: 'rgba(168,85,247,0.1)',
    icon: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
  },
  {
    key: 'create-girl', name: 'Своя\nдевушка', to: '/create-girl',
    iconColor: '#EC4899', bg: 'rgba(236,72,153,0.1)',
    icon: <><circle cx={12} cy={8} r={4} /><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /></>,
  },
  {
    key: 'feed', name: 'Лента', to: '/community',
    iconColor: '#22C55E', bg: 'rgba(34,197,94,0.1)',
    icon: <><circle cx={12} cy={12} r={10} /><line x1={2} y1={12} x2={22} y2={12} /></>,
  },
];

interface Stats {
  requests: number;
  simulations: number;
  avgScore: number | null;
  daysInApp: number;
}

interface ActiveDialog {
  kind: 'wing' | 'sim';
  title: string;
  subtitle: string;
  to: string;
  initial: string;
  gradient: [string, string];
  // refs для удаления:
  contactId?: string;     // для kind='wing'
  storageKey?: string;    // для kind='sim'
}

const GRAD_POOL: [string, string][] = [
  ['#F43F5E', '#EC4899'],
  ['#A855F7', '#6366F1'],
  ['#22C55E', '#06B6D4'],
  ['#EF4444', '#F59E0B'],
  ['#6366F1', '#A855F7'],
  ['#EC4899', '#F59E0B'],
];

export function HomeScreen() {
  const { me } = useMe();
  const nav = useNavigate();
  const tgUser = getTgUser();
  const [stats, setStats] = useState<Stats>({ requests: 0, simulations: 0, avgScore: null, daysInApp: 1 });
  const [activeDialogs, setActiveDialogs] = useState<ActiveDialog[]>([]);

  useEffect(() => {
    getStats()
      .then(res => {
        if (!res?.ok) return;
        setStats({
          requests:    res.stats.requests ?? 0,
          simulations: res.stats.simulations ?? 0,
          avgScore:    res.stats.avg_score,
          daysInApp:   res.stats.days_in_app ?? 1,
        });
      })
      .catch(() => {});

    // Активные диалоги: контакты Стрелы (из API) + симуляторные сессии
    // (из localStorage). Сливаем и показываем максимум 3 свежих.
    const loadDialogs = async () => {
      // Автоочистка пустых стартов sim-сессий — чтобы в списке не было
      // мусорных дубликатов после многократных «открыл и вышел».
      cleanupEmptySimSessions();
      const dialogs: ActiveDialog[] = [];

      // Wing-контакты
      try {
        const res = await contactsApi.getAll();
        if (res?.ok && res.contacts) {
          (res.contacts as Contact[]).slice(0, 5).forEach((c, i) => {
            dialogs.push({
              kind: 'wing',
              title: c.name,
              subtitle: c.typazh || 'Стрела · разбор',
              to: `/wing?contact=${c.id}`,
              initial: (c.name?.trim() || '?').slice(0, 1).toUpperCase(),
              gradient: GRAD_POOL[i % GRAD_POOL.length],
              contactId: String(c.id),
            });
          });
        }
      } catch (_) {}

      // Симуляторные сессии из localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const m = /^cupidon:[^:]+:sim_session_(.+)$/.exec(k);
        if (!m) continue;
        try {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          const data = JSON.parse(raw);
          // Только настоящие диалоги (>=2 сообщений) — иначе это пустой
          // тестовый старт без ответа юзера, не показываем.
          if (!Array.isArray(data.messages) || data.messages.length < 2) continue;
          const suffix = m[1];
          const underIdx = suffix.indexOf('_');
          const typazhRaw = underIdx > 0 ? suffix.slice(0, underIdx) : suffix;
          const typazh = cleanTypazhName(data.typazh || typazhRaw);
          const place  = underIdx > 0 ? suffix.slice(underIdx + 1) : '';
          const girlName: string | undefined = data.girl_name;
          // Title: «Алиса · Стервозная» если есть имя, иначе просто «Стервозная»
          const title = girlName ? `${girlName} · ${typazh}` : typazh;
          const initialChar = (girlName || typazh).trim().slice(0, 1).toUpperCase() || '?';
          dialogs.push({
            kind: 'sim',
            title,
            subtitle: place ? `Симулятор · ${place}` : 'Симулятор',
            to: `/simulator/chat/${encodeURIComponent(data.session_id)}?key=${encodeURIComponent('sim_session_' + suffix)}`,
            initial: initialChar,
            gradient: GRAD_POOL[(dialogs.length + 2) % GRAD_POOL.length],
            storageKey: 'sim_session_' + suffix,
          });
        } catch (_) {}
      }

      // Показываем до 3 диалогов на главной — остальное в /all-dialogs
      setActiveDialogs(dialogs.slice(0, 3));
    };
    loadDialogs();
  }, []);

  const greetingName = me?.user_profile?.name || me?.first_name || 'друг';
  const avatarText = (greetingName.trim() || 'C').slice(0, 1).toUpperCase();
  const avgDisplay = stats.avgScore != null ? stats.avgScore.toFixed(1) : '—';
  // Совет дня — детерминированно по UTC-дате (см. utils/dailyTips.ts).
  // Меняется каждые сутки. useMemo чтобы не пересчитывалось на ререндерах.
  const tipOfDay = useMemo(() => getTipOfDay(), []);

  return (
    <Layout withTabBar>
      <div style={{ padding: '16px 20px 0' }}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.greeting}>Привет, {greetingName}</h1>
          <button
            onClick={() => { selectionHaptic(); nav('/profile'); }}
            style={styles.profileBtn}
            aria-label="Профиль"
          >
            {tgUser?.photo_url ? (
              <img src={tgUser.photo_url} alt="" style={styles.profileImg} />
            ) : (
              <span style={styles.profileInitial}>{avatarText}</span>
            )}
          </button>
        </div>

        {/* Инструменты */}
        <section style={styles.section}>
          <SectionHeader title="Инструменты" />
          <div style={styles.qaScroll}>
            {quickActions.map(qa => (
              <button
                key={qa.key}
                onClick={() => { impactHaptic('light'); nav(qa.to); }}
                style={styles.qaCard}
              >
                <div style={{ ...styles.qaIcon, background: qa.bg }}>
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none"
                       stroke={qa.iconColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    {qa.icon}
                  </svg>
                </div>
                <span style={styles.qaName}>{qa.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Активные диалоги */}
        <section style={styles.section}>
          <SectionHeader title="Активные диалоги" linkText="Все" onLinkClick={() => nav('/all-dialogs')} />
          {activeDialogs.length === 0 ? (
            <Card style={styles.emptyDialogs}>
              <p style={styles.emptyText}>
                Пока нет диалогов. Открой <b style={{ color: 'var(--text-accent)' }}>Стрелу</b> и проанализируй первую переписку.
              </p>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeDialogs.map((d, i) => (
                <Card
                  key={`${d.kind}-${i}`}
                  onClick={() => { selectionHaptic(); nav(d.to); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 22,
                    background: `linear-gradient(135deg, ${d.gradient[0]}, ${d.gradient[1]})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 16,
                    flexShrink: 0,
                  }}>{d.initial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{d.title}</div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{d.subtitle}</div>
                  </div>
                  <DialogActionsMenu
                    confirmText={`Удалить «${d.title}»?`}
                    onDelete={async () => {
                      if (d.kind === 'wing' && d.contactId) {
                        const ok = await deleteWingContact(d.contactId);
                        if (ok) setActiveDialogs(prev => prev.filter(x => !(x.kind === 'wing' && x.contactId === d.contactId)));
                      } else if (d.kind === 'sim' && d.storageKey) {
                        deleteSimSession(d.storageKey);
                        setActiveDialogs(prev => prev.filter(x => !(x.kind === 'sim' && x.storageKey === d.storageKey)));
                      }
                    }}
                  />
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Прогресс */}
        <section style={styles.section}>
          <SectionHeader title="Прогресс" />
          <Card accent style={styles.progressCard}>
            <div style={styles.statsRow}>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Запросы</span>
                <span style={styles.statValue}>{stats.requests}</span>
              </div>
              <div style={{ ...styles.statItem, alignItems: 'center' }}>
                <span style={styles.statLabel}>Симуляции</span>
                <span style={styles.statValue}>{stats.simulations}</span>
              </div>
              <div style={{ ...styles.statItem, alignItems: 'flex-end' }}>
                <span style={styles.statLabel}>Средний балл</span>
                <span style={styles.statValue}>{avgDisplay}</span>
              </div>
            </div>
            <p style={styles.progressHint}>
              {stats.requests === 0
                ? 'Сделай первый анализ — и здесь появится твой график роста.'
                : `В приложении уже ${stats.daysInApp} ${pluralDays(stats.daysInApp)}. Продолжай!`}
            </p>
          </Card>
        </section>

        {/* Совет дня */}
        <section style={styles.section}>
          <Card style={styles.tipCard}>
            <div style={styles.tipRow}>
              <div style={styles.tipIcon}>
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6" /><path d="M10 22h4" />
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" />
                </svg>
              </div>
              <div>
                <div style={styles.tipTitle}>Совет дня</div>
                <p style={styles.tipText}>{tipOfDay}</p>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </Layout>
  );
}

function pluralDays(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

function SectionHeader({ title, linkText, onLinkClick }: { title: string; linkText?: string; onLinkClick?: () => void }) {
  return (
    <div style={styles.sectionHeader}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {linkText && (
        <button onClick={onLinkClick} style={styles.sectionLink}>
          {linkText}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
  },
  greeting: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: '28px',
  },
  profileBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  profileImg: { width: '100%', height: '100%', objectFit: 'cover' },
  profileInitial: { fontSize: 16, fontWeight: 700, color: 'var(--text-accent)' },

  section: { marginBottom: 24 },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  sectionLink: {
    fontSize: 13,
    color: 'var(--text-accent)',
    background: 'transparent',
    cursor: 'pointer',
  },

  qaScroll: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    paddingBottom: 4,
    scrollbarWidth: 'none',
  },
  qaCard: {
    flexShrink: 0,
    minWidth: 110,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
  },
  qaIcon: {
    width: 40, height: 40, borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  qaName: {
    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
    textAlign: 'center', whiteSpace: 'pre-line', lineHeight: '16px',
  },

  emptyDialogs: { padding: '20px 16px' },
  emptyText: {
    margin: 0,
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: '20px',
    textAlign: 'center',
  },

  progressCard: { display: 'flex', flexDirection: 'column', gap: 12 },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  statItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  statLabel: { fontSize: 12, color: 'var(--text-muted)' },
  statValue: { fontSize: 22, fontWeight: 700, color: 'var(--text-accent)' },
  progressHint: {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: '17px',
  },

  tipCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-accent)',
    backgroundImage: 'linear-gradient(135deg, rgba(244,63,94,0.06), rgba(168,85,247,0.06))',
  },
  tipRow: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  tipIcon: {
    width: 40, height: 40, borderRadius: 20,
    background: 'rgba(245, 158, 11, 0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  tipTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 },
  tipText: { margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: '20px' },
};
