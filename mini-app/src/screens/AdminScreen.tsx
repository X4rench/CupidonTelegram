// ═══════════════════════════════════════════════════════════════
// AdminScreen — TMA-версия RBAC админки.
//
// Гейт: me.is_admin === true (бэк проверяет ADMIN_TELEGRAM_IDS).
// Если не админ — показываем «Нет доступа» и кнопку «На главную».
//
// 4 таба:
//   - Статистика: users/analyses/simulations/avg_score/requests_today
//   - Промпты:    список → редактор (system_prompt, model, temp, max_tokens,
//                 is_active) → Сохранить → Тест
//   - Логи:       последние request_logs (endpoint, method, status, ms)
//   - Audit:      admin_audit_log — кто что менял
//
// Отличия от RN-версии:
//   - Нет ввода admin_secret (TMA initData достаточно).
//   - Pagination нет — limit=100 хватает.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic, notificationHaptic, impactHaptic } from '../utils/haptics';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { Layout } from '../components/Layout';
import {
  adminApi,
  partnerAdminApi,
  communityAdminApi,
  type AdminPrompt,
  type AdminStats,
  type AdminRequestLog,
  type AdminAuditEntry,
  type AdminPromptTestResp,
  type AdminPartnerRow,
  type AdminPartnersDashboardResp,
  type CommunityFullPost,
} from '../api';

type Tab = 'stats' | 'prompts' | 'subs' | 'logs' | 'audit' | 'partners' | 'moderation';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stats',      label: 'Статистика' },
  { id: 'subs',       label: 'Подписки' },
  { id: 'partners',   label: 'Партнёры' },
  { id: 'moderation', label: 'Модерация' },
  { id: 'prompts',    label: 'Промпты' },
  { id: 'logs',       label: 'Логи' },
  { id: 'audit',      label: 'Audit' },
];

export function AdminScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const { me, loading } = useMe();

  // Если зашли на /admin/partners — начинаем с таба «Партнёры»
  const initialTab: Tab = useMemo(() => {
    if (location.pathname.startsWith('/admin/partners')) return 'partners';
    return 'stats';
  }, [location.pathname]);

  const [tab, setTab] = useState<Tab>(initialTab);

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка...</div>
      </Layout>
    );
  }

  if (!me?.is_admin) {
    return <NoAccess onBack={() => nav('/profile')} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Админ-панель</span>
        <span style={styles.badge}>ADMIN</span>
      </div>

      <div style={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { selectionHaptic(); setTab(t.id); }}
            style={{
              ...styles.tab,
              borderColor: tab === t.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
              color: tab === t.id ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === 'stats'      && <StatsTab />}
        {tab === 'subs'       && <SubsTab />}
        {tab === 'partners'   && <PartnersTab />}
        {tab === 'moderation' && <ModerationTab />}
        {tab === 'prompts'    && <PromptsTab />}
        {tab === 'logs'       && <LogsTab />}
        {tab === 'audit'      && <AuditTab />}
      </div>
    </div>
  );
}

// ─── No access ───────────────────────────────────────────────────────────────

function NoAccess({ onBack }: { onBack: () => void }) {
  return (
    <Layout>
      <div style={styles.noAccessWrap}>
        <div style={styles.noAccessIcon}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5}>
            <rect x={3} y={11} width={18} height={11} rx={2} />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1 style={styles.noAccessTitle}>Нет доступа</h1>
        <p style={styles.noAccessText}>
          Эта страница доступна только администраторам Сервиса. Если ты считаешь,
          что это ошибка — напиши в поддержку.
        </p>
        <div style={{ marginTop: 24 }}>
          <GradientButton onClick={onBack} full>На главную</GradientButton>
        </div>
      </div>
    </Layout>
  );
}

// ─── Stats Tab ───────────────────────────────────────────────────────────────

function StatsTab() {
  const nav = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getStats();
      setStats(res.stats);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote>Загружаем статистику...</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;
  if (!stats)  return null;

  // metric — ключ для /admin/chart/<metric> (null → не кликабельна, без диаграммы)
  type Metric = { label: string; value: string | number; emoji: string; metric: string | null };

  // Базовые метрики (приложение в целом)
  const generalMetrics: Metric[] = [
    { label: 'Пользователей',     value: stats.users,        emoji: '👥', metric: 'users' },
    { label: 'Анализов',          value: stats.analyses,     emoji: '🔍', metric: 'analyses' },
    { label: 'Симуляций',         value: stats.simulations,  emoji: '🎭', metric: 'simulations' },
    { label: 'Средний скор',      value: stats.avg_score != null ? stats.avg_score.toFixed(1) : '—',
                                                             emoji: '⭐', metric: null },
    { label: 'Запросов сегодня',  value: stats.requests_today, emoji: '⚡', metric: 'requests' },
  ];
  if (stats.rejections != null) {
    generalMetrics.push({ label: 'Разборы отказов', value: stats.rejections, emoji: '💔', metric: 'rejections' });
  }
  generalMetrics.push({ label: 'Партнёры', value: '→', emoji: '💼', metric: 'partners' });

  // Подписки по тиру (новые M24)
  const byTier = stats.paid_subs_by_tier;
  const subMetrics: Metric[] = byTier ? [
    { label: 'Всего активных', value: stats.paid_subs ?? 0,    emoji: '💎', metric: 'paid_subs' },
    { label: 'Basic',          value: byTier.basic,            emoji: '🔵', metric: 'paid_subs_basic' },
    { label: 'Premium',        value: byTier.premium,          emoji: '⭐', metric: 'paid_subs_premium' },
    { label: 'Day Pass',       value: byTier.day_pass,         emoji: '⚡', metric: 'paid_subs_day_pass' },
  ] : [];

  // Free-юзеры (новые M24)
  const freeMetrics: Metric[] = stats.free_users_total != null ? [
    { label: 'Free всего',        value: stats.free_users_total,        emoji: '👤', metric: null },
    { label: 'Free активн. сегодня', value: stats.free_users_today ?? 0, emoji: '🆓', metric: 'free_active' },
    { label: 'С запасными запр.', value: stats.bonus_quota_users ?? 0,  emoji: '🎁', metric: null },
  ] : [];

  const util = stats.limit_utilization;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        Тапни по карточке → откроется диаграмма за 30 дней / 12 месяцев.
        Обновление — раз в 24 часа.
      </div>

      {/* Общая статистика */}
      <SectionTitle>Приложение</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {generalMetrics.map(m => <MetricRow key={m.label} m={m} nav={nav} />)}
      </div>

      {/* Подписки по тиру */}
      {subMetrics.length > 0 && (
        <>
          <SectionTitle>Подписки</SectionTitle>
          {/* Donut по тиру (если есть хоть одна подписка) */}
          {stats.paid_subs && stats.paid_subs > 0 && byTier && (
            <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <SubsDonut data={byTier} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <DonutLegend color="#3B82F6" label="Basic"    value={byTier.basic}    total={stats.paid_subs} />
                <DonutLegend color="#A855F7" label="Premium"  value={byTier.premium}  total={stats.paid_subs} />
                <DonutLegend color="#22C55E" label="Day Pass" value={byTier.day_pass} total={stats.paid_subs} />
              </div>
            </Card>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subMetrics.map(m => <MetricRow key={m.label} m={m} nav={nav} />)}
          </div>
        </>
      )}

      {/* Free-юзеры */}
      {freeMetrics.length > 0 && (
        <>
          <SectionTitle>Free-юзеры</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {freeMetrics.map(m => <MetricRow key={m.label} m={m} nav={nav} />)}
          </div>
        </>
      )}

      {/* Утилизация дневных лимитов */}
      {util && (util.basic_users + util.premium_users + util.free_users) > 0 && (
        <>
          <SectionTitle>Утилизация лимитов (сегодня)</SectionTitle>
          <Card>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Средний % использования дневного лимита по активным сегодня юзерам.
            </div>
            <UtilBar color="#3B82F6" label="Basic"   pct={util.basic_avg_pct}   users={util.basic_users} />
            <UtilBar color="#A855F7" label="Premium" pct={util.premium_avg_pct} users={util.premium_users} />
            <UtilBar color="#94A3B8" label="Free"    pct={util.free_avg_pct}    users={util.free_users} />
          </Card>
        </>
      )}

      <div style={{ marginTop: 8 }}>
        <SecondaryButton onClick={load} full>Обновить</SecondaryButton>
      </div>
    </div>
  );
}

// ── Компоненты для StatsTab ──────────────────────────────────────────────────

function MetricRow({ m, nav }: {
  m: { label: string; value: string | number; emoji: string; metric: string | null };
  nav: (path: string) => void;
}) {
  const clickable = m.metric != null;
  return (
    <Card
      onClick={clickable ? () => { selectionHaptic(); nav(`/admin/chart/${m.metric}`); } : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 80ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22 }}>{m.emoji}</span>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{m.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-accent)' }}>{m.value}</span>
        {clickable && (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
            <polyline points="9,18 15,12 9,6" />
          </svg>
        )}
      </div>
    </Card>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 style={{
      margin: '4px 0 4px',
      fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.6,
      color: 'var(--text-muted)',
    }}>{children}</h3>
  );
}

// Donut chart для разбивки подписок по тиру — inline SVG, без библиотек.
function SubsDonut({ data }: { data: { basic: number; premium: number; day_pass: number } }) {
  const total = data.basic + data.premium + data.day_pass;
  if (total === 0) return null;
  const segments = [
    { value: data.basic,    color: '#3B82F6' },
    { value: data.premium,  color: '#A855F7' },
    { value: data.day_pass, color: '#22C55E' },
  ];
  const size = 92, stroke = 12, r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r}
              fill="none" stroke="var(--border-subtle)" strokeWidth={stroke} />
      {segments.map((s, i) => {
        if (s.value === 0) return null;
        const len = (s.value / total) * C;
        const el = (
          <circle key={i}
            cx={size/2} cy={size/2} r={r}
            fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x={size/2} y={size/2 + 6} textAnchor="middle"
            fontSize={20} fontWeight={700} fill="var(--text-primary)">
        {total}
      </text>
    </svg>
  );
}

function DonutLegend({ color, label, value, total }: {
  color: string; label: string; value: number; total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{
        display: 'inline-block', width: 10, height: 10,
        borderRadius: 2, background: color, flexShrink: 0,
      }} />
      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
      <span style={{ color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function UtilBar({ color, label, pct, users }: {
  color: string; label: string; pct: number; users: number;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4, fontSize: 13,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {users === 0 ? 'нет активных' : `${users} ${pluralUsers(users)} · ${pct}%`}
        </span>
      </div>
      <div style={{
        height: 10, borderRadius: 5,
        background: 'var(--bg-elevated)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, pct)}%`, height: '100%',
          background: color,
          transition: 'width 240ms',
        }} />
      </div>
    </div>
  );
}

function pluralUsers(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'юзер';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'юзера';
  return 'юзеров';
}

// ─── Subscriptions Tab ──────────────────────────────────────────────────────
// Поиск юзера по telegram_user_id → выдать/отозвать подписку.

function SubsTab() {
  const [tgIdInput, setTgIdInput] = useState('');
  const [user, setUser] = useState<any>(null);
  const [activeSub, setActiveSub] = useState<any>(null);
  const [plan, setPlan] = useState<'basic' | 'premium' | 'day_pass'>('basic');
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const lookup = async () => {
    const tgId = parseInt(tgIdInput.trim(), 10);
    if (!Number.isFinite(tgId)) {
      setError('Введи числовой TG ID');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    setUser(null);
    setActiveSub(null);
    try {
      const res = await adminApi.findUser(tgId);
      if (res.ok) {
        setUser(res.user);
        setActiveSub(res.active_subscription);
      } else {
        setError(res.error || 'Юзер не найден');
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка запроса');
    } finally {
      setLoading(false);
    }
  };

  const grant = async () => {
    if (!user) return;
    if (!confirm(`Выдать подписку ${plan} на ${days} дней юзеру ${user.telegram_user_id}?`)) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminApi.grantSubscription(user.telegram_user_id, plan, days);
      if (res.ok) {
        notificationHaptic('success');
        setMessage(`✓ Подписка ${plan} выдана до ${new Date(res.expires_at).toLocaleString('ru-RU')}`);
        await lookup();
      } else {
        setError(res.error || 'Не удалось выдать');
        notificationHaptic('error');
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (target: 'sub' | 'day_pass' | 'all') => {
    if (!user) return;
    const label = target === 'sub' ? `подписку ${activeSub?.plan || ''}`
                : target === 'day_pass' ? 'Day Pass (бонусные запросы)'
                : 'всё (подписку и Day Pass)';
    if (!confirm(`Отозвать у юзера ${user.telegram_user_id}: ${label}? Это необратимо (но можно выдать заново).`)) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminApi.revokeSubscription(user.telegram_user_id, target);
      if (res.ok) {
        notificationHaptic('success');
        const parts: string[] = [];
        if (res.revoked?.sub)      parts.push(`подписка ${res.revoked.sub.plan}`);
        if (res.revoked?.day_pass) parts.push(`Day Pass (${res.revoked.day_pass.had_tg_quota} запр / ${res.revoked.day_pass.had_sim_quota} сим)`);
        setMessage(`✓ Отозвано: ${parts.join(' + ') || 'ничего не было'}`);
        await lookup();
      } else {
        setError(res.error || 'Не удалось отозвать');
        notificationHaptic('error');
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  // Список подписчиков — отдельно от единичного поиска
  const [subscribers, setSubscribers] = useState<any[] | null>(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const loadSubscribers = async () => {
    setSubsLoading(true);
    try {
      const res = await adminApi.getSubscribers();
      if (res.ok) setSubscribers(res.subscribers || []);
    } catch (_) {}
    finally { setSubsLoading(false); }
  };

  const pickSubscriber = (tgId: number) => {
    selectionHaptic();
    setTgIdInput(String(tgId));
    // Сразу подгружаем юзера
    setTimeout(() => lookup(), 0);
  };

  // Активный Day Pass если bonus_expires_at > now
  const hasActiveDayPass = (() => {
    const u = user;
    if (!u?.bonus_expires_at) return false;
    const expIso = u.bonus_expires_at;
    const ms = Date.parse(/[Zz]|[+\-]\d\d:?\d\d$/.test(expIso) ? expIso : expIso.replace(' ', 'T') + 'Z');
    return Number.isFinite(ms) && ms > Date.now() && ((u.tg_bonus_quota || 0) > 0 || (u.sim_bonus_quota || 0) > 0);
  })();

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Поиск юзера</div>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Telegram user ID (например 794285476)"
          value={tgIdInput}
          onChange={e => setTgIdInput(e.target.value)}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10,
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', fontSize: 15, marginBottom: 10,
          }}
        />
        <SecondaryButton onClick={lookup} full disabled={loading}>
          {loading ? 'Загрузка…' : 'Найти'}
        </SecondaryButton>
      </Card>

      {error && (
        <Card style={{ borderColor: 'var(--status-negative)' }}>
          <span style={{ color: 'var(--status-negative)', fontSize: 14 }}>{error}</span>
        </Card>
      )}

      {message && (
        <Card style={{ borderColor: 'var(--status-positive)' }}>
          <span style={{ color: 'var(--status-positive)', fontSize: 14 }}>{message}</span>
        </Card>
      )}

      {user && (
        <>
          <Card>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {user.first_name || ''} {user.last_name || ''} {user.username ? `(@${user.username})` : ''}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
              <div>TG ID: <strong>{user.telegram_user_id}</strong></div>
              <div>Тариф сейчас: <strong style={{ color: 'var(--text-accent)' }}>{user.sub_tier || 'free'}</strong></div>
              {user.sub_expires_at && (
                <div>Действует до: {new Date(user.sub_expires_at).toLocaleString('ru-RU')}</div>
              )}
              {activeSub && (
                <div style={{ marginTop: 4, padding: 8, background: 'var(--accent-soft)', borderRadius: 6 }}>
                  Активная подписка: <strong>{activeSub.plan}</strong> ({activeSub.source})
                </div>
              )}
              {/* Day Pass info — отдельный блок, не пересекается с подпиской */}
              {hasActiveDayPass && (
                <div style={{
                  marginTop: 4, padding: 8,
                  background: 'rgba(34,197,94,0.10)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: 6,
                }}>
                  ⚡ <strong>Активный Day Pass:</strong>{' '}
                  {user.tg_bonus_quota || 0} запросов · {user.sim_bonus_quota || 0} сим-сообщений
                  {user.bonus_expires_at && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      · сгорит {new Date(user.bonus_expires_at).toLocaleString('ru-RU')}
                    </span>
                  )}
                </div>
              )}
              {!hasActiveDayPass && (user.tg_bonus_quota > 0 || user.sim_bonus_quota > 0) && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  Day Pass истёк, остатки очистятся при следующем запросе юзера.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Выдать подписку</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['basic', 'premium', 'day_pass'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8,
                    background: plan === p ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                    color: plan === p ? '#fff' : 'var(--text-secondary)',
                    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {p === 'basic' ? 'Basic' : p === 'premium' ? 'Premium' : 'Day Pass'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Дней:</span>
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={e => setDays(parseInt(e.target.value, 10) || 1)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', fontSize: 15,
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 7, 30, 90].map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <GradientButton full onClick={grant} loading={loading}>
              Выдать {plan} на {days} дн.
            </GradientButton>
          </Card>

          {(activeSub || hasActiveDayPass) && (
            <Card style={{ borderColor: 'var(--status-warning)' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Отозвать</div>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
                Доступ прекратится <strong>прямо сейчас</strong>. Действие необратимо
                (но можно выдать заново).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSub && (
                  <SecondaryButton onClick={() => revoke('sub')} full disabled={loading} style={{ color: 'var(--status-negative)' }}>
                    Отозвать подписку {activeSub.plan}
                  </SecondaryButton>
                )}
                {hasActiveDayPass && (
                  <SecondaryButton onClick={() => revoke('day_pass')} full disabled={loading} style={{ color: 'var(--status-negative)' }}>
                    Отозвать Day Pass ({user.tg_bonus_quota || 0} запр / {user.sim_bonus_quota || 0} сим)
                  </SecondaryButton>
                )}
                {activeSub && hasActiveDayPass && (
                  <SecondaryButton onClick={() => revoke('all')} full disabled={loading} style={{ color: 'var(--status-negative)', fontWeight: 700 }}>
                    Отозвать всё разом
                  </SecondaryButton>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Список подписчиков — отдельная карточка */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>Все подписчики</div>
          <SecondaryButton onClick={loadSubscribers} disabled={subsLoading}>
            {subsLoading ? 'Загрузка…' : subscribers ? 'Обновить' : 'Показать'}
          </SecondaryButton>
        </div>
        {subscribers && subscribers.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
            Никого с активной подпиской / Day Pass нет
          </div>
        )}
        {subscribers && subscribers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              Тапни на юзера → подгрузится в форму выше, можно отозвать. Всего: {subscribers.length}
            </div>
            {subscribers.map(s => {
              const nowMs = Date.now();
              const subActive = !!s.active_plan;
              const dpActive = (() => {
                if (!s.bonus_expires_at) return false;
                const iso = s.bonus_expires_at;
                const m = Date.parse(/[Zz]|[+\-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z');
                return Number.isFinite(m) && m > nowMs;
              })();
              return (
                <div
                  key={s.telegram_user_id}
                  onClick={() => pickSubscriber(s.telegram_user_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {s.first_name || ''} {s.last_name || ''}
                      {s.username && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>@{s.username}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      TG <strong>{s.telegram_user_id}</strong>
                      {' · '}
                      {subActive && <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>{s.active_plan}</span>}
                      {subActive && dpActive && ' + '}
                      {dpActive && <span style={{ color: 'var(--status-positive)', fontWeight: 600 }}>Day Pass ({s.tg_bonus_quota || 0})</span>}
                    </div>
                  </div>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                       stroke="var(--text-muted)" strokeWidth={2}>
                    <polyline points="9,18 15,12 9,6" />
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}

// ─── Prompts Tab ─────────────────────────────────────────────────────────────

function PromptsTab() {
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [models, setModels] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pres, mres] = await Promise.all([
        adminApi.getPrompts(),
        adminApi.getModels().catch(() => null),
      ]);
      setPrompts(pres.prompts);
      setSelectedId(prev => prev != null ? prev : (pres.prompts[0]?.id ?? null));
      if (mres?.models) {
        const m: string[] = [];
        if (mres.models.primary)  m.push(mres.models.primary);
        if (mres.models.fallback && mres.models.fallback !== mres.models.primary) m.push(mres.models.fallback);
        // Доп-модели из объекта
        Object.values(mres.models).forEach((v) => {
          if (typeof v === 'string' && !m.includes(v)) m.push(v);
        });
        setModels(m);
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить промпты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote>Загружаем промпты...</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;
  if (prompts.length === 0) return <EmptyNote>Промпты не настроены.</EmptyNote>;

  const selected = prompts.find(p => p.id === selectedId) || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={styles.promptListRow}>
        {prompts.map((p) => (
          <button
            key={p.id}
            onClick={() => { selectionHaptic(); setSelectedId(p.id); }}
            style={{
              ...styles.promptChip,
              borderColor: selectedId === p.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background:  selectedId === p.id ? 'var(--accent-soft)'    : 'var(--bg-card)',
              color:       selectedId === p.id ? 'var(--text-accent)'    : 'var(--text-muted)',
            }}
          >
            {p.name || p.key}
          </button>
        ))}
      </div>

      {selected && (
        <PromptEditor
          key={selected.id}
          prompt={selected}
          modelOptions={models}
          onSaved={load}
        />
      )}
    </div>
  );
}

function PromptEditor({ prompt, modelOptions, onSaved }: {
  prompt: AdminPrompt;
  modelOptions: string[];
  onSaved: () => void;
}) {
  const [systemPrompt, setSystemPrompt] = useState(prompt.system_prompt);
  const [model, setModel] = useState(prompt.model);
  const [temperature, setTemperature] = useState(String(prompt.temperature));
  const [maxTokens, setMaxTokens] = useState(String(prompt.max_tokens));
  const [isActive, setIsActive] = useState<boolean>(!!prompt.is_active);
  const [saving, setSaving] = useState(false);

  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<AdminPromptTestResp | { error: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const allModels = [...new Set([model, ...modelOptions])].filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updatePrompt(prompt.id, {
        system_prompt: systemPrompt,
        model,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens, 10),
        is_active: isActive ? 1 : 0,
      });
      notificationHaptic('success');
      onSaved();
    } catch (e: any) {
      impactHaptic('medium');
      alert(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testInput.trim()) {
      alert('Введи тестовый запрос');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.testPrompt({
        prompt_id: prompt.id,
        system_prompt: systemPrompt,
        model,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens, 10),
        test_input: testInput,
      });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ error: e?.message || 'Ошибка теста' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {prompt.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{prompt.description}</div>
      )}

      <Field label="Системный промпт">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          style={{ ...styles.textarea, minHeight: 140 }}
        />
      </Field>

      <Field label="Модель">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allModels.map((m) => (
            <button
              key={m}
              onClick={() => { selectionHaptic(); setModel(m); }}
              style={{
                ...styles.modelOption,
                borderColor: model === m ? 'var(--accent-primary)' : 'var(--border-subtle)',
                background:  model === m ? 'var(--accent-soft)'    : 'var(--bg-card)',
                color:       model === m ? 'var(--text-accent)'    : 'var(--text-muted)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Temperature" style={{ flex: 1 }}>
          <input
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            inputMode="decimal"
            style={styles.input}
          />
        </Field>
        <Field label="Max tokens" style={{ flex: 1 }}>
          <input
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            inputMode="numeric"
            style={styles.input}
          />
        </Field>
      </div>

      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => { selectionHaptic(); setIsActive(v => !v); }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Активен</span>
      </label>

      <GradientButton onClick={save} loading={saving} full>
        {saving ? 'Сохранение...' : 'Сохранить промпт'}
      </GradientButton>

      <div style={styles.divider} />

      <Field label="Тестовый запрос">
        <textarea
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder="Введи тестовые данные..."
          style={{ ...styles.textarea, minHeight: 80 }}
        />
      </Field>

      <SecondaryButton onClick={test} disabled={testing} full>
        {testing ? 'Тестирование...' : 'Тест промпта'}
      </SecondaryButton>

      {testResult && (
        <div style={styles.testResult}>
          {'error' in testResult && testResult.error ? (
            <div style={{ color: 'var(--status-negative)', fontSize: 13 }}>
              Ошибка: {testResult.error}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{(testResult as AdminPromptTestResp).duration_ms} ms</span>
                <span>{(testResult as AdminPromptTestResp).model}</span>
              </div>
              <pre style={styles.testRaw}>
                {(testResult as AdminPromptTestResp).raw || '(пустой ответ)'}
              </pre>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Logs Tab ────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<AdminRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getLogs(100);
      setLogs(res.logs);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить логи');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote>Загружаем логи...</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;
  if (logs.length === 0) return <EmptyNote>Логов нет.</EmptyNote>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SecondaryButton onClick={load} full>Обновить</SecondaryButton>
      {logs.map((log) => (
        <Card key={log.id} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {log.method} {log.endpoint}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(log.response_status) }}>
              {log.response_status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{log.duration_ms} ms</span>
            {log.device_id && <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.device_id}</span>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{log.created_at}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Audit Tab ───────────────────────────────────────────────────────────────

function AuditTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAuditLog(100, actionFilter || undefined);
      setEntries(res.entries || res.logs || []);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить audit-log');
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Фильтр по action (опционально)">
        <input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="prompt_update, ..."
          style={styles.input}
        />
      </Field>
      <SecondaryButton onClick={load} full>Применить / Обновить</SecondaryButton>

      {loading && <LoadingNote>Загружаем audit-log...</LoadingNote>}
      {error   && <ErrorBlock message={error} onRetry={load} />}
      {!loading && !error && entries.length === 0 && <EmptyNote>Audit-log пуст.</EmptyNote>}

      {entries.map((e) => (
        <Card key={e.id} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-accent)' }}>{e.action}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.created_at}</span>
          </div>
          {e.ip && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              IP: {e.ip}
            </div>
          )}
          {e.details && (
            <details>
              <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Подробнее
              </summary>
              <pre style={styles.testRaw}>{tryPretty(e.details)}</pre>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

function tryPretty(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw; }
}

// ─── Partners Tab ───────────────────────────────────────────────────────────

function PartnersTab() {
  const nav = useNavigate();
  const [partners, setPartners] = useState<AdminPartnerRow[]>([]);
  const [dashboard, setDashboard] = useState<AdminPartnersDashboardResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  // Форма создания
  const [tgId, setTgId] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [commissionPct, setCommissionPct] = useState(50);
  const [notes, setNotes] = useState('');
  const [payoutDetails, setPayoutDetails] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, dash] = await Promise.all([
        partnerAdminApi.list({
          status: statusFilter === 'all' ? undefined : statusFilter,
          q: query.trim() || undefined,
        }),
        partnerAdminApi.getDashboard().catch(() => null),
      ]);
      setPartners(list.partners || []);
      if (dash) setDashboard(dash);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить список');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setTgId(''); setCode(''); setDisplayName('');
    setCommissionPct(50); setNotes(''); setPayoutDetails('');
  };

  const onCreate = async () => {
    const tg = parseInt(tgId.trim(), 10);
    if (!Number.isFinite(tg)) {
      alert('TG ID должен быть числом');
      return;
    }
    const codeNorm = code.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(codeNorm)) {
      alert('Код: 3-30 символов, только a-z, 0-9, _');
      return;
    }
    if (!displayName.trim()) {
      alert('ФИО обязательно');
      return;
    }
    setCreating(true);
    try {
      let parsedDetails: Record<string, any> | undefined;
      if (payoutDetails.trim()) {
        // Пробуем распарсить как JSON, иначе кладём как { raw: "..." }
        try { parsedDetails = JSON.parse(payoutDetails); }
        catch { parsedDetails = { raw: payoutDetails.trim() }; }
      }
      const res = await partnerAdminApi.create({
        telegram_user_id: tg,
        code: codeNorm,
        display_name: displayName.trim(),
        commission_pct: commissionPct,
        payout_details: parsedDetails,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        notificationHaptic('success');
        resetForm();
        setCreatorOpen(false);
        await load();
      } else {
        notificationHaptic('error');
        alert(res.error || 'Не удалось создать');
      }
    } catch (e: any) {
      notificationHaptic('error');
      alert(e?.message || 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const totals = dashboard?.totals;
  const top5 = dashboard?.top5 || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Сводка */}
      {totals && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            📊 Сводка
          </div>
          <SummaryRow label="Активных партнёров" value={String(totals.active_partners)} />
          <SummaryRow label="Всего привлечено" value={String(totals.total_referrals)} />
          <SummaryRow label="Доход (за 30 д.)" value={`${formatRub(totals.gross_revenue)} ₽`} />
          <SummaryRow label="Партнёрам начислено" value={`${formatRub(totals.commission_paid_out)} ₽`} accent />
          <SummaryRow label="К выплате прямо сейчас" value={`${formatRub(totals.available_kopecks)} ₽`} accent />
          <SummaryRow label="Pending payouts" value={String(totals.pending_payouts)} />
        </Card>
      )}

      {/* Top-5 */}
      {top5.length > 0 && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            🏆 Top-5
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top5.map((t) => (
              <button
                key={t.partner_id}
                onClick={() => { selectionHaptic(); nav(`/admin/partners/${t.partner_id}`); }}
                style={topRowStyle}
              >
                <span style={topRankStyle}>{t.rank}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}>
                  {t.display_name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>{t.code}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-accent)' }}>
                  {formatRub(t.total)} ₽
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Create button + creator inline */}
      {!creatorOpen && (
        <GradientButton onClick={() => { impactHaptic('medium'); setCreatorOpen(true); }} full>
          + Добавить партнёра
        </GradientButton>
      )}

      {creatorOpen && (
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
            Создать партнёра
          </div>
          <Field label="TG ID партнёра">
            <input
              type="number"
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="794285476"
              style={styles.input}
              inputMode="numeric"
            />
          </Field>
          <div style={{ height: 8 }} />
          <Field label="Код (a-z, 0-9, _; 3-30 символов)">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              placeholder="anna_dating"
              style={styles.input}
              maxLength={30}
            />
          </Field>
          <div style={{ height: 8 }} />
          <Field label="ФИО / Имя для отчётов">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Анна Иванова"
              style={styles.input}
              maxLength={120}
            />
          </Field>
          <div style={{ height: 8 }} />
          <Field label={`% комиссии: ${commissionPct}%`}>
            <input
              type="range"
              min={10} max={80}
              value={commissionPct}
              onChange={(e) => setCommissionPct(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>10%</span><span>50%</span><span>80%</span>
            </div>
          </Field>
          <div style={{ height: 8 }} />
          <Field label="Заметки (опционально)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Канал, аудитория, договорённости…"
              style={{ ...styles.textarea, minHeight: 60 }}
              maxLength={2000}
            />
          </Field>
          <div style={{ height: 8 }} />
          <Field label="Реквизиты для выплат (опционально, JSON или текст)">
            <textarea
              value={payoutDetails}
              onChange={(e) => setPayoutDetails(e.target.value)}
              placeholder={'{"bank":"Tinkoff","card":"5536...0000"}'}
              style={{ ...styles.textarea, minHeight: 50, fontFamily: 'ui-monospace, monospace' }}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <SecondaryButton onClick={() => { setCreatorOpen(false); resetForm(); }} full disabled={creating}>
              Отмена
            </SecondaryButton>
            <GradientButton onClick={onCreate} loading={creating} full>
              Создать
            </GradientButton>
          </div>
        </Card>
      )}

      {/* Search + status filter */}
      <Card>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: код, имя, TG ID…"
          style={styles.input}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {(['all', 'active', 'paused', 'archived'] as const).map(s => (
            <button
              key={s}
              onClick={() => { selectionHaptic(); setStatusFilter(s); }}
              style={{
                ...styles.tab,
                padding: '6px 12px',
                fontSize: 11,
                borderColor: statusFilter === s ? 'var(--accent-primary)' : 'var(--border-subtle)',
                background: statusFilter === s ? 'var(--accent-soft)' : 'transparent',
                color: statusFilter === s ? 'var(--text-accent)' : 'var(--text-muted)',
              }}
            >
              {s === 'all' ? 'Все' : s === 'active' ? 'Active' : s === 'paused' ? 'Paused' : 'Archived'}
            </button>
          ))}
          <button
            onClick={load}
            style={{
              ...styles.tab,
              padding: '6px 12px',
              fontSize: 11,
              borderColor: 'var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-muted)',
              marginLeft: 'auto',
            }}
          >
            Применить
          </button>
        </div>
      </Card>

      {/* List */}
      {loading && <LoadingNote>Загружаем партнёров…</LoadingNote>}
      {error && <ErrorBlock message={error} onRetry={load} />}
      {!loading && !error && partners.length === 0 && (
        <EmptyNote>Нет партнёров под фильтром.</EmptyNote>
      )}
      {!loading && !error && partners.map((p) => (
        <button
          key={p.id}
          onClick={() => { selectionHaptic(); nav(`/admin/partners/${p.id}`); }}
          style={partnerCardStyle}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {p.display_name}
            </span>
            <StatusChip status={p.status} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-accent)', marginBottom: 8, fontFamily: 'ui-monospace, monospace' }}>
            {p.code}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>Привёл <strong style={{ color: 'var(--text-primary)' }}>{p.referrals}</strong></span>
            <span>Заработал <strong style={{ color: 'var(--text-primary)' }}>{formatRub(p.lifetime_earned)} ₽</strong></span>
            <span>К выплате <strong style={{ color: 'var(--text-accent)' }}>{formatRub(p.available_kopecks)} ₽</strong></span>
            <span>Ставка <strong style={{ color: 'var(--text-primary)' }}>{p.commission_pct}%</strong></span>
          </div>
        </button>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: accent ? 'var(--text-accent)' : 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:   { bg: 'rgba(34,197,94,0.16)', color: 'var(--status-positive)', label: 'Active' },
    paused:   { bg: 'rgba(245,158,11,0.16)', color: 'var(--status-warning)', label: 'Paused' },
    archived: { bg: 'rgba(113,113,122,0.20)', color: 'var(--text-muted)', label: 'Archived' },
  };
  const v = map[status] || { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', label: status };
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 10, fontWeight: 700,
      background: v.bg,
      color: v.color,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }}>
      {v.label}
    </span>
  );
}

function formatRub(kopecks: number): string {
  const rub = Math.round(kopecks / 100);
  return rub.toLocaleString('ru-RU');
}

const topRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px',
  background: 'var(--bg-elevated)',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
};

const topRankStyle: CSSProperties = {
  width: 22, height: 22, borderRadius: 11,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--accent-soft)',
  color: 'var(--text-accent)',
  fontSize: 11, fontWeight: 700,
  flexShrink: 0,
};

const partnerCardStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: 14,
  borderRadius: 14,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-card)',
  cursor: 'pointer',
};

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

function LoadingNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{children}</div>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{children}</div>;
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ padding: 12, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--status-negative)', fontSize: 13 }}>
        {message}
      </div>
      <SecondaryButton onClick={onRetry} full>Повторить</SecondaryButton>
    </div>
  );
}

function statusColor(s: number): string {
  if (s >= 500) return 'var(--status-negative)';
  if (s >= 400) return 'var(--status-warning)';
  return 'var(--status-positive)';
}

// ─── Moderation Tab ─────────────────────────────────────────────────────────
// Список pending-постов сообщества. Каждый — превью + Approve / Reject.

function ModerationTab() {
  const [posts, setPosts] = useState<Array<CommunityFullPost & { telegram_user_id: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await communityAdminApi.pending();
      setPosts(res.posts || []);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onApprove = async (id: number) => {
    if (busy) return;
    setBusy(id);
    try {
      await communityAdminApi.approve(id);
      notificationHaptic('success');
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      alert(e?.message || 'Не удалось одобрить');
    } finally {
      setBusy(null);
    }
  };

  const onReject = async () => {
    if (busy || !rejectId) return;
    setBusy(rejectId);
    try {
      await communityAdminApi.reject(rejectId, rejectReason.trim() || undefined);
      notificationHaptic('success');
      setPosts(prev => prev.filter(p => p.id !== rejectId));
      setRejectId(null);
      setRejectReason('');
    } catch (e: any) {
      alert(e?.message || 'Не удалось отклонить');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingNote>Загружаем pending-посты…</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Постов в очереди: <b>{posts.length}</b>
      </div>

      {posts.length === 0 ? (
        <Card style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
          Пока нечего модерировать
        </Card>
      ) : posts.map(p => (
        <Card key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {p.author_name} · {p.girl_name ? `${p.girl_name} (${p.typazh})` : p.typazh}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                TG: {p.telegram_user_id} · {new Date(p.created_at).toLocaleString('ru-RU')}
              </div>
            </div>
            {p.score != null && (
              <div style={{
                fontSize: 12, fontWeight: 700,
                padding: '4px 8px', borderRadius: 8,
                background: 'var(--accent-soft)', color: 'var(--text-accent)',
              }}>
                {p.score.toFixed ? p.score.toFixed(1) : p.score} / 10
              </div>
            )}
          </div>

          {/* Превью диалога */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            maxHeight: 200, overflowY: 'auto',
            padding: 8,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
          }}>
            {p.messages.map((m, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: '17px' }}>
                <b style={{ color: m.from === 'me' ? 'var(--text-accent)' : 'var(--text-secondary)' }}>
                  {m.from === 'me' ? 'Юзер:' : (p.girl_name || p.typazh) + ':'}
                </b>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{m.text}</span>
              </div>
            ))}
          </div>

          {/* Действия */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onApprove(p.id)}
              disabled={busy === p.id}
              style={{
                flex: 1, padding: '10px',
                borderRadius: 10, border: 0,
                background: 'var(--status-positive)', color: '#fff',
                fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                opacity: busy === p.id ? 0.6 : 1,
              }}
            >
              ✓ Одобрить
            </button>
            <button
              onClick={() => { setRejectId(p.id); setRejectReason(''); }}
              disabled={busy === p.id}
              style={{
                flex: 1, padding: '10px',
                borderRadius: 10,
                border: '1px solid var(--status-negative)',
                background: 'transparent', color: 'var(--status-negative)',
                fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                opacity: busy === p.id ? 0.6 : 1,
              }}
            >
              ✕ Отклонить
            </button>
          </div>
        </Card>
      ))}

      <div style={{ marginTop: 8 }}>
        <SecondaryButton onClick={load} full>Обновить</SecondaryButton>
      </div>

      {/* Модалка ввода причины отклонения */}
      {rejectId != null && (
        <div onClick={() => setRejectId(null)} style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 360,
            background: 'var(--bg-card)',
            borderRadius: 14,
            padding: 18,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Причина отклонения
            </div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Опционально — для своей истории"
              rows={3}
              style={{
                width: '100%',
                padding: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 13,
                resize: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRejectId(null)} style={{
                flex: 1, padding: 10, borderRadius: 8,
                border: '1px solid var(--border-default)', background: 'transparent',
                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
              }}>Отмена</button>
              <button onClick={onReject} style={{
                flex: 1, padding: 10, borderRadius: 8, border: 0,
                background: 'var(--status-negative)', color: '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}>Отклонить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 16px)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px 12px',
  },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: 6,
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    letterSpacing: 0.4,
  },

  tabs: {
    display: 'flex',
    gap: 6,
    padding: '0 20px',
    overflowX: 'auto',
    marginBottom: 16,
  },
  tab: {
    border: '1px solid',
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 120ms, color 120ms',
  },

  content: { padding: '0 20px' },

  noAccessWrap: { padding: '60px 24px 40px', textAlign: 'center' },
  noAccessIcon: { display: 'inline-flex', marginBottom: 16, opacity: 0.6 },
  noAccessTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' },
  noAccessText: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },

  promptListRow: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    paddingBottom: 4,
  },
  promptChip: {
    border: '1px solid',
    borderRadius: 20,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    maxWidth: 200,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  textarea: {
    width: '100%',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.4,
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  input: {
    width: '100%',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: '10px 12px',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 14,
  },
  modelOption: {
    border: '1px solid',
    borderRadius: 8,
    padding: 10,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    wordBreak: 'break-all',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  divider: {
    height: 1,
    background: 'var(--border-subtle)',
    margin: '4px 0',
  },
  testResult: {
    padding: 12,
    borderRadius: 10,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
  },
  testRaw: {
    margin: 0,
    fontSize: 11,
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    maxHeight: 240,
    overflowY: 'auto',
  },
};
