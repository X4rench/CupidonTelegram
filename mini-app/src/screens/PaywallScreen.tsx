// ═══════════════════════════════════════════════════════════════
// PaywallScreen — экран покупки подписки и +запросов (только ЮКасса).
//
// Stars-оплата убрана из UI. На бэке функции createStarsInvoice /
// startStarsPayment остались как библиотечные, но не вызываются отсюда.
//
// Маршрут: /paywall — открывается:
//   - из usePaywall().open({reason}) (через декларативный mount в App.tsx)
//   - или прямой навигацией с любого экрана
//
// Тарифы (точные цены — в бэкенде YK_PRICE_*):
//   - Basic    280 ₽ / месяц — 30 запросов/день, все режимы
//   - Premium  700 ₽ / месяц — 100 запросов/день, 18+ персонажи
//   - +100 запросов (Day Pass) 70 ₽ — пополнение tg_bonus_quota
//     (НЕ создаёт subscription, НЕ меняет tier, тратится по 1 за запрос)
//
// Поток оплаты:
//   1. Тап «Купить за NNN ₽ картой» → createYookassaInvoice(plan)
//   2. Открываем confirmation_url через WebApp.openLink / window.open
//   3. Polling /users/me каждые 3с × 10 — ждём пока вебхук обновит:
//        - для basic/premium  — tier
//        - для day_pass       — tg_bonus_quota
//   4. На успех — toast + закрытие экрана
//
// Если бэк вернул 503 (YK_SHOP_ID не задан) — показываем сообщение
// «Платежи временно недоступны».
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { usePaywall, type PaywallReason } from '../contexts/PaywallContext';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { createYookassaInvoice, getMe, type StarsPlan, type BillingPeriod } from '../api';

// Цены в рублях для UI. Точные суммы — на бэкенде в YK_PRICE_*.
// Месячные + квартальные + годовые цены отдельно (новая фича).
const RUB_PRICES: Record<StarsPlan, number> = {
  basic:    parseInt(import.meta.env.VITE_RUB_PRICE_BASIC || '299', 10) || 299,
  premium:  parseInt(import.meta.env.VITE_RUB_PRICE_PREMIUM || '899', 10) || 899,
  day_pass: parseInt(import.meta.env.VITE_RUB_PRICE_DAY_PASS || '99', 10) || 99,
};

const RUB_PRICES_3M: Record<'basic' | 'premium', number> = {
  basic:   parseInt(import.meta.env.VITE_RUB_PRICE_BASIC_3M || '799', 10) || 799,
  premium: parseInt(import.meta.env.VITE_RUB_PRICE_PREMIUM_3M || '2399', 10) || 2399,
};

const RUB_PRICES_12M: Record<'basic' | 'premium', number> = {
  basic:   parseInt(import.meta.env.VITE_RUB_PRICE_BASIC_12M || '2990', 10) || 2990,
  premium: parseInt(import.meta.env.VITE_RUB_PRICE_PREMIUM_12M || '8990', 10) || 8990,
};

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly:   'Месяц',
  quarterly: '3 мес',
  yearly:    'Год',
};

const PERIOD_SUBTITLES: Record<BillingPeriod, string> = {
  monthly:   '/ мес',
  quarterly: '/ 3 мес',
  yearly:    '/ год',
};

function priceForPlanPeriod(plan: 'basic' | 'premium', period: BillingPeriod): number {
  if (period === 'monthly')   return RUB_PRICES[plan];
  if (period === 'quarterly') return RUB_PRICES_3M[plan];
  return RUB_PRICES_12M[plan];
}

function periodDiscountPct(plan: 'basic' | 'premium', period: BillingPeriod): number {
  if (period === 'monthly') return 0;
  const months = period === 'quarterly' ? 3 : 12;
  const baseline = RUB_PRICES[plan] * months;
  const actual = priceForPlanPeriod(plan, period);
  if (baseline <= 0) return 0;
  return Math.round((1 - actual / baseline) * 100);
}

function perMonthFor(plan: 'basic' | 'premium', period: BillingPeriod): number {
  if (period === 'monthly') return RUB_PRICES[plan];
  const months = period === 'quarterly' ? 3 : 12;
  return Math.round(priceForPlanPeriod(plan, period) / months);
}

// Количество запросов которые добавляет Day Pass. Должно совпадать с
// DAY_PASS_BONUS_QUOTA на бэке (default 100).
const DAY_PASS_BONUS = parseInt(import.meta.env.VITE_DAY_PASS_BONUS || '100', 10) || 100;

interface PlanConfig {
  id: StarsPlan;
  title: string;
  subtitle: string;
  features: string[];
  highlight?: boolean; // выделить рамкой и градиентом
  badge?: string;      // top-right бейдж («⭐ САМЫЙ ПОПУЛЯРНЫЙ»)
}

const SUBSCRIPTION_PLANS: PlanConfig[] = [
  {
    id: 'basic',
    title: 'Basic',
    subtitle: '/ месяц',
    features: [
      '30 анализов в день',
      'Все режимы AI',
      'История переписок',
    ],
  },
  {
    id: 'premium',
    title: 'Premium',
    subtitle: '/ месяц',
    highlight: true,
    badge: 'САМЫЙ ПОПУЛЯРНЫЙ',
    features: [
      '100 анализов в день',
      '18+ персонажи в симуляторе',
      'Приоритетная поддержка',
      'Расширенный контекст и история',
    ],
  },
];

const DAY_PASS_PLAN: PlanConfig = {
  id: 'day_pass',
  title: `+${DAY_PASS_BONUS} запросов`,
  subtitle: '(одноразово)',
  features: [
    'Прибавляется к дневному лимиту',
    'Не сгорает, тратится по 1 за запрос',
    'Работает на любом тарифе, включая Free',
  ],
};

export function PaywallScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const { me, refresh } = useMe();
  const paywall = usePaywall();

  const reason: PaywallReason = paywall.reason
    ?? (location.state as any)?.reason
    ?? 'manual';

  const [busyPlan, setBusyPlan] = useState<StarsPlan | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  const closeAndBack = useCallback(() => {
    paywall.close();
    nav(-1);
  }, [paywall, nav]);

  useBackButton(closeAndBack);

  // Авто-скрытие toast через 4с (для не-success ситуаций)
  useEffect(() => {
    if (!toast || toast.kind === 'success') return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const heading = useMemo(() => {
    if (reason === 'limit') return 'Лимит исчерпан';
    if (reason === 'nsfw')  return '18+ открывается в Premium';
    return 'Открой все возможности Купидона';
  }, [reason]);

  const subheading = useMemo(() => {
    if (reason === 'limit') {
      const used = me?.daily_used ?? 0;
      const limit = me?.daily_limit ?? 5;
      return `Использовано ${used} из ${limit} запросов сегодня. Выбери тариф или докупи запросы.`;
    }
    if (reason === 'nsfw') {
      return 'Откровенные сценарии в Симуляторе доступны на Premium-тарифе.';
    }
    return 'Безлимитная практика, расширенный AI и приоритетная поддержка.';
  }, [reason, me]);

  const tier = me?.tier ?? 'free';
  const bonusQuota = me?.tg_bonus_quota ?? 0;
  const expiresAt = me?.sub_expires_at ?? null;

  const handlePayCard = useCallback(async (plan: StarsPlan) => {
    if (busyPlan) return;
    impactHaptic('medium');
    setBusyPlan(plan);
    setToast(null);

    try {
      const effectivePeriod: BillingPeriod = plan === 'day_pass' ? 'monthly' : period;
      const res = await createYookassaInvoice(plan, effectivePeriod);
      if (!res.ok || !res.confirmation_url) {
        // Бэк может вернуть 503 если YK_SHOP_ID/YK_SECRET_KEY не заданы.
        notificationHaptic('error');
        setPaymentsUnavailable(true);
        setToast({
          kind: 'error',
          text: res.error || 'Платежи временно недоступны. Попробуй позже.',
        });
        setBusyPlan(null);
        return;
      }
      // Открываем оплату — в TG через openLink, вне TG через window.open
      const tg = (window as any)?.Telegram?.WebApp;
      if (tg?.openLink) {
        tg.openLink(res.confirmation_url);
      } else {
        window.open(res.confirmation_url, '_blank');
      }
      setToast({ kind: 'info', text: 'Открываем оплату… После оплаты статус обновится автоматически.' });
      // Polling — ждём пока вебхук активирует подписку или начислит запросы
      const initialTier = me?.tier ?? 'free';
      const initialBonus = me?.tg_bonus_quota ?? 0;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const meRes = await getMe();
          const user = meRes?.user;
          if (!user) continue;
          const tierChanged = user.tier && user.tier !== initialTier && user.tier !== 'free';
          const bonusGrew = (user.tg_bonus_quota ?? 0) > initialBonus;
          if (tierChanged || bonusGrew) {
            notificationHaptic('success');
            await refresh();
            setToast({
              kind: 'success',
              text: plan === 'day_pass'
                ? `Зачислено +${DAY_PASS_BONUS} запросов`
                : 'Подписка активирована',
            });
            setTimeout(() => closeAndBack(), 1400);
            return;
          }
        } catch (_) { /* продолжаем polling */ }
      }
      // Не дождались — оставляем экран открытым с подсказкой
      setToast({
        kind: 'info',
        text: 'Платёж в обработке. Если оплата завершена — обнови экран через минуту.',
      });
    } catch (err: any) {
      notificationHaptic('error');
      setToast({ kind: 'error', text: err?.message || 'Ошибка оплаты' });
    } finally {
      setBusyPlan(null);
    }
  }, [busyPlan, me, refresh, closeAndBack]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={closeAndBack} style={styles.closeBtn} aria-label="Закрыть">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)"
               strokeWidth={2.4} strokeLinecap="round">
            <line x1={18} y1={6}  x2={6}  y2={18} />
            <line x1={6}  y1={6}  x2={18} y2={18} />
          </svg>
        </button>
        <span style={styles.headerTitle}>Подписка</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.heroIcon}>
          <span style={{ fontSize: 30, lineHeight: 1 }}>💘</span>
        </div>
        <h1 style={styles.heroTitle}>{heading}</h1>
        <p style={styles.heroSub}>{subheading}</p>
        {bonusQuota > 0 && (
          <div style={styles.bonusBadge}>
            <span>У тебя ещё +{bonusQuota} запасных {pluralRequests(bonusQuota)}</span>
          </div>
        )}
      </div>

      {paymentsUnavailable && (
        <div style={styles.warnBox}>
          Платежи временно недоступны. Попробуй позже или напиши в поддержку.
        </div>
      )}

      {/* Period switcher — monthly / quarterly / yearly */}
      <div style={styles.periodSwitcherWrap}>
        <div style={styles.periodSwitcher}>
          {(['monthly', 'quarterly', 'yearly'] as BillingPeriod[]).map(p => {
            const active = period === p;
            // Считаем средний дисконт по basic/premium для показа в чипе
            const discountBasic = periodDiscountPct('basic', p);
            return (
              <button
                key={p}
                onClick={() => { selectionHapticSafe(); setPeriod(p); }}
                style={{
                  ...styles.periodChip,
                  background: active ? 'var(--accent-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <span>{PERIOD_LABELS[p]}</span>
                {discountBasic > 0 && (
                  <span style={{
                    ...styles.discountBadge,
                    background: active ? 'rgba(255,255,255,0.22)' : 'rgba(34,197,94,0.18)',
                    color: active ? '#fff' : 'var(--status-positive)',
                  }}>−{discountBasic}%</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subscription plans */}
      <div style={styles.plans}>
        {SUBSCRIPTION_PLANS.map(plan => {
          const isSubPlan = plan.id === 'basic' || plan.id === 'premium';
          const price = isSubPlan
            ? priceForPlanPeriod(plan.id as 'basic' | 'premium', period)
            : RUB_PRICES[plan.id];
          const perMonth = isSubPlan
            ? perMonthFor(plan.id as 'basic' | 'premium', period)
            : 0;
          const discount = isSubPlan
            ? periodDiscountPct(plan.id as 'basic' | 'premium', period)
            : 0;
          return (
            <PlanCard
              key={plan.id}
              cfg={plan}
              price={price}
              periodSubtitle={isSubPlan ? PERIOD_SUBTITLES[period] : plan.subtitle}
              perMonth={isSubPlan && period !== 'monthly' ? perMonth : null}
              discountPct={discount}
              isCurrent={tier === plan.id}
              expiresAt={tier === plan.id ? expiresAt : null}
              busy={busyPlan === plan.id}
              disabled={busyPlan != null && busyPlan !== plan.id}
              onBuy={() => handlePayCard(plan.id)}
            />
          );
        })}
      </div>

      {/* Day Pass — отдельная секция */}
      <h2 style={styles.sectionTitle}>Докупить запросы</h2>
      <div style={styles.plans}>
        <DayPassCard
          cfg={DAY_PASS_PLAN}
          price={RUB_PRICES.day_pass}
          currentBonus={bonusQuota}
          busy={busyPlan === 'day_pass'}
          disabled={busyPlan != null && busyPlan !== 'day_pass'}
          onBuy={() => handlePayCard('day_pass')}
        />
      </div>

      {/* Доп. CTA — промо/реферал */}
      <div style={styles.extra}>
        <button style={styles.linkBtn} onClick={() => { impactHaptic('light'); nav('/promo'); }}>
          Есть промокод?
        </button>
        <span style={styles.dot}>·</span>
        <button style={styles.linkBtn} onClick={() => { impactHaptic('light'); nav('/referral'); }}>
          Пригласить друга
        </button>
      </div>

      <p style={styles.legal}>
        Оплата картой через ЮКассу. Подписка действует 30 дней без автопродления.
        Возврат — напиши в поддержку через профиль.
      </p>

      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.kind === 'success'
            ? 'var(--status-positive)'
            : toast.kind === 'error'
              ? 'var(--status-negative)'
              : 'var(--bg-elevated)',
          color: toast.kind === 'info' ? 'var(--text-primary)' : '#fff',
          border: toast.kind === 'info' ? '1px solid var(--border-default)' : 'none',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Карточка тарифа (Basic / Premium) ────────────────────────────────────────

interface PlanCardProps {
  cfg: PlanConfig;
  price: number;
  isCurrent: boolean;
  expiresAt: string | null;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
}

function PlanCard({ cfg, price, isCurrent, expiresAt, busy, disabled, onBuy }: PlanCardProps) {
  return (
    <div style={{
      ...styles.card,
      border: cfg.highlight
        ? '2px solid var(--accent-primary)'
        : '1.5px solid var(--border-subtle)',
      background: cfg.highlight ? 'var(--accent-soft)' : 'var(--bg-card)',
      boxShadow: cfg.highlight ? 'var(--glow-accent)' : undefined,
      position: 'relative',
    }}>
      {cfg.badge && (
        <div style={styles.popularBadge}>⭐ {cfg.badge}</div>
      )}

      <div style={styles.planHead}>
        <span style={styles.planTitle}>{cfg.title}</span>
      </div>

      <div style={styles.priceRow}>
        <span style={styles.priceBig}>{price} ₽</span>
        <span style={styles.priceSub}>{cfg.subtitle}</span>
      </div>

      <FeatureList items={cfg.features} />

      {isCurrent ? (
        <div style={styles.activeBadge}>
          <CheckSvg color="#fff" />
          <span>Активен{expiresAt ? ` до ${formatDate(expiresAt)}` : ''}</span>
        </div>
      ) : (
        <BuyButton
          highlight={!!cfg.highlight}
          busy={busy}
          disabled={disabled}
          onClick={onBuy}
          label={busy ? 'Открываем оплату…' : `Купить за ${price} ₽`}
        />
      )}
    </div>
  );
}

// ── Day Pass card — нейтральный стиль, отдельная секция ──────────────────────

interface DayPassCardProps {
  cfg: PlanConfig;
  price: number;
  currentBonus: number;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
}

function DayPassCard({ cfg, price, currentBonus, busy, disabled, onBuy }: DayPassCardProps) {
  return (
    <div style={{
      ...styles.card,
      border: '1.5px solid var(--border-default)',
      background: 'var(--bg-card)',
    }}>
      <div style={styles.planHead}>
        <span style={styles.planTitle}>{cfg.title}</span>
      </div>

      <div style={styles.priceRow}>
        <span style={styles.priceBig}>{price} ₽</span>
        <span style={styles.priceSub}>{cfg.subtitle}</span>
      </div>

      <FeatureList items={cfg.features} />

      {currentBonus > 0 && (
        <div style={styles.bonusHint}>
          У тебя сейчас +{currentBonus} запасных {pluralRequests(currentBonus)}
        </div>
      )}

      <BuyButton
        highlight={false}
        busy={busy}
        disabled={disabled}
        onClick={onBuy}
        label={busy ? 'Открываем оплату…' : `Купить за ${price} ₽`}
      />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul style={styles.features}>
      {items.map(f => (
        <li key={f} style={styles.feature}>
          <span style={styles.featureCheck}><CheckSvg /></span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function CheckSvg({ color = 'var(--status-positive)' }: { color?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

interface BuyButtonProps {
  highlight: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  label: ReactNode;
}

function BuyButton({ highlight, busy, disabled, onClick, label }: BuyButtonProps) {
  const isDisabled = busy || disabled;
  return (
    <button
      onClick={() => { if (!isDisabled) onClick(); }}
      disabled={isDisabled}
      style={{
        marginTop: 16,
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        fontSize: 15,
        fontWeight: 700,
        border: highlight ? 'none' : '1px solid var(--border-default)',
        background: highlight ? 'var(--gradient-accent)' : 'var(--bg-elevated)',
        color: highlight ? '#fff' : 'var(--text-primary)',
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
        transition: 'opacity 160ms, transform 80ms',
        boxShadow: highlight ? 'var(--glow-accent)' : 'none',
      }}
      onPointerDown={(e) => { if (!isDisabled) (e.currentTarget.style.transform = 'scale(0.98)'); }}
      onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {label}
    </button>
  );
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function pluralRequests(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'запрос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'запроса';
  return 'запросов';
}

// ── Стили ────────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 8px)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 8px',
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },

  hero: {
    padding: '16px 20px 24px',
    textAlign: 'center',
  },
  heroIcon: {
    width: 64, height: 64, borderRadius: 20,
    background: 'var(--gradient-accent)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 14px',
    boxShadow: 'var(--glow-strong)',
  },
  heroTitle: {
    margin: 0,
    fontSize: 24, fontWeight: 800, color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  heroSub: {
    margin: '10px auto 0',
    maxWidth: 320,
    fontSize: 14, lineHeight: '20px',
    color: 'var(--text-secondary)',
  },
  bonusBadge: {
    display: 'inline-flex',
    margin: '14px auto 0',
    padding: '6px 12px',
    fontSize: 12, fontWeight: 600,
    color: 'var(--status-positive)',
    background: 'rgba(34, 197, 94, 0.10)',
    border: '1px solid rgba(34, 197, 94, 0.30)',
    borderRadius: 10,
  },

  warnBox: {
    margin: '0 20px 16px',
    padding: '12px 14px',
    fontSize: 13, lineHeight: '18px',
    background: 'rgba(245,158,11,0.10)',
    border: '1px solid rgba(245,158,11,0.30)',
    color: 'var(--status-warning, #F59E0B)',
    borderRadius: 12,
    textAlign: 'center',
  },

  sectionTitle: {
    margin: '28px 20px 12px',
    fontSize: 13, fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted)',
  },

  plans: {
    padding: '0 20px',
    display: 'flex', flexDirection: 'column', gap: 16,
  },

  card: {
    borderRadius: 18,
    padding: '18px 18px 18px',
    transition: 'border-color 160ms, box-shadow 160ms',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#fff',
    background: 'var(--gradient-accent)',
    borderRadius: 8,
    boxShadow: 'var(--glow-accent)',
  },

  planHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 14,
  },
  priceBig: {
    fontSize: 32,
    fontWeight: 800,
    color: 'var(--text-primary)',
    lineHeight: 1,
  },
  priceSub: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-muted)',
  },

  features: {
    listStyle: 'none', margin: 0, padding: 0,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  feature: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    fontSize: 14, lineHeight: '20px', color: 'var(--text-secondary)',
  },
  featureCheck: {
    display: 'inline-flex',
    flex: '0 0 16px',
    paddingTop: 2,
  },

  activeBadge: {
    marginTop: 16,
    width: '100%',
    padding: '13px 16px',
    borderRadius: 12,
    background: 'var(--status-positive)',
    color: '#fff',
    fontSize: 14, fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  bonusHint: {
    marginTop: 12,
    padding: '8px 12px',
    background: 'var(--bg-elevated)',
    border: '1px dashed var(--border-default)',
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },

  extra: {
    marginTop: 24,
    padding: '0 20px',
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-accent)',
    fontSize: 13, fontWeight: 500,
    padding: 4,
    cursor: 'pointer',
  },
  dot: { margin: '0 6px', color: 'var(--text-muted)' },

  legal: {
    margin: '20px 24px 0',
    fontSize: 11, lineHeight: '16px', textAlign: 'center',
    color: 'var(--text-muted)',
  },

  toast: {
    position: 'fixed',
    left: 16, right: 16,
    bottom: 'calc(var(--safe-bottom) + 16px)',
    padding: '12px 16px',
    borderRadius: 12,
    fontSize: 14, fontWeight: 600,
    textAlign: 'center',
    zIndex: 100,
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
  },
};

export default PaywallScreen;
