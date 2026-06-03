// ═══════════════════════════════════════════════════════════════
// PaywallScreen — экран оплаты подписки за Telegram Stars.
//
// Маршрут: /paywall — открывается:
//   - из usePaywall().open({reason}) (через декларативный mount в App.tsx)
//   - или прямой навигацией с любого экрана
//
// Тарифы (цены фиксированно в бэкенде, на UI отображаем константы):
//   - Basic    199 ⭐ — 30 дней, 30 запросов/день, без NSFW
//   - Premium  499 ⭐ — 30 дней, 100 запросов/день, NSFW unlock
//   - DayPass   50 ⭐ — 24ч без лимита (только если уже Basic/Premium активен)
//
// Поток оплаты:
//   1. Тап «Купить за N⭐» → startStarsPayment(plan) → WebApp.openInvoice
//   2. TG показывает нативный экран Stars
//   3. callback получает 'paid' | 'cancelled' | 'failed' | 'pending'
//   4. 'paid' → notificationHaptic('success') → me.refresh() →
//      usePaywall().close() → nav(-1) + toast «Подписка активирована»
//   5. иначе — notificationHaptic('error'), остаёмся на экране
// ═══════════════════════════════════════════════════════════════
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { usePaywall, type PaywallReason } from '../contexts/PaywallContext';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { startStarsPayment, isStarsPaymentAvailable } from '../utils/payments';
import { createYookassaInvoice, getMe, type StarsPlan } from '../api';

// Курс Stars → ₽ для отображения примерной рублёвой цены. Stars покупаются
// через @PremiumBot за рубли по курсу ~1.4-1.5 ₽/звезда (зависит от региона).
// Точная цена видна юзеру при открытии invoice в TG. Здесь — только подсказка.
const STARS_TO_RUB = parseFloat(import.meta.env.VITE_STARS_TO_RUB || '1.4') || 1.4;

// ЮКасса включена? Проверка через env-флаг VITE_YOOKASSA_ENABLED.
// При false — вторая кнопка "Купить картой" не отображается.
const YOOKASSA_ENABLED = (import.meta.env.VITE_YOOKASSA_ENABLED ?? '0') === '1';

// Цены в рублях (для UI). Точные суммы — на бэке в YK_PRICE_*.
const RUB_PRICES: Record<StarsPlan, number> = {
  basic: parseInt(import.meta.env.VITE_RUB_PRICE_BASIC || '280', 10) || 280,
  premium: parseInt(import.meta.env.VITE_RUB_PRICE_PREMIUM || '700', 10) || 700,
  day_pass: parseInt(import.meta.env.VITE_RUB_PRICE_DAY_PASS || '70', 10) || 70,
};

// ── Конфиг тарифов ───────────────────────────────────────────────────────────
// Source-of-truth для цен — backend (process.env.STARS_PRICE_*).
// Здесь — только для отображения. Если бэкенд изменит цену — TG покажет
// реальную сумму при openInvoice, а UI поправится в следующем релизе.
interface PlanConfig {
  id: StarsPlan;
  title: string;
  price: number;
  badge?: string;
  badgeAccent?: boolean;
  features: string[];
  highlight?: boolean;
}

const PLAN_CONFIGS: PlanConfig[] = [
  {
    id: 'basic',
    title: 'Basic',
    price: 199,
    badge: '30 дней',
    features: [
      '30 запросов в день',
      'Симулятор, Стрела, Первое сообщение',
      'Разбор отказов и поддержка',
    ],
  },
  {
    id: 'premium',
    title: 'Premium',
    price: 499,
    badge: 'Хит',
    badgeAccent: true,
    highlight: true,
    features: [
      '100 запросов в день',
      'Все режимы + расширенный контекст',
      'Приоритет в очереди AI',
      'NSFW-режим в Симуляторе',
    ],
  },
  // day_pass рендерим отдельно — только если уже есть активный Basic/Premium
];

export function PaywallScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const { me, refresh } = useMe();
  const paywall = usePaywall();

  // reason может приходить либо из контекста, либо из location.state (если
  // экран открыт прямой навигацией с явным состоянием).
  const reason: PaywallReason = paywall.reason
    ?? (location.state as any)?.reason
    ?? 'manual';
  const defaultPlan: StarsPlan = paywall.defaultPlan
    ?? (location.state as any)?.defaultPlan
    ?? 'premium';

  const [busyPlan, setBusyPlan] = useState<StarsPlan | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [selected, setSelected] = useState<StarsPlan>(defaultPlan);

  const closeAndBack = useCallback(() => {
    paywall.close();
    nav(-1);
  }, [paywall, nav]);

  useBackButton(closeAndBack);

  // Есть ли активная подписка → показываем Day Pass
  const hasActiveSub = !!me && (me.tier === 'basic' || me.tier === 'premium');
  const tgAvailable = isStarsPaymentAvailable();

  const heading = useMemo(() => {
    if (reason === 'limit') return 'Лимит исчерпан';
    if (reason === 'nsfw')  return 'NSFW открывается в Premium';
    return 'Купидон Premium';
  }, [reason]);

  const subheading = useMemo(() => {
    if (reason === 'limit') {
      const used = me?.daily_used ?? 0;
      const limit = me?.daily_limit ?? 5;
      return `Ты использовал ${used} из ${limit} бесплатных запросов сегодня. Подпишись чтобы продолжить.`;
    }
    if (reason === 'nsfw') {
      return 'Откровенные сценарии в Симуляторе доступны в Premium-тире.';
    }
    return 'Безлимитная практика, приоритет, NSFW. Оплата за Telegram Stars.';
  }, [reason, me]);

  const handleBuy = useCallback(async (plan: StarsPlan) => {
    if (busyPlan) return;
    impactHaptic('medium');
    setBusyPlan(plan);
    setToast(null);

    try {
      const status = await startStarsPayment(plan);

      if (status === 'paid') {
        notificationHaptic('success');
        await refresh();
        setToast({ kind: 'success', text: 'Подписка активирована' });
        setTimeout(() => {
          closeAndBack();
        }, 1200);
      } else if (status === 'pending') {
        notificationHaptic('warning');
        setToast({ kind: 'success', text: 'Платёж в обработке. Проверь подписку через минуту.' });
      } else if (status === 'cancelled') {
        // тихо — пользователь сам отменил
      } else {
        notificationHaptic('error');
        setToast({
          kind: 'error',
          text: tgAvailable
            ? 'Не удалось оплатить. Попробуй ещё раз.'
            : 'Покупка работает только в Telegram. Открой мини-приложение в TG.',
        });
      }
    } catch (err: any) {
      notificationHaptic('error');
      setToast({ kind: 'error', text: err?.message || 'Ошибка оплаты' });
    } finally {
      setBusyPlan(null);
    }
  }, [busyPlan, refresh, closeAndBack, tgAvailable]);

  // ── ЮКасса (Phase I) ───────────────────────────────────────────────────────
  // 1. Запрашиваем confirmation_url у бэка.
  // 2. Открываем в TG WebView (или window.open вне TG).
  // 3. Polling /users/me каждые 3с × 10 — ждём пока webhook ЮКассы активирует
  //    подписку. Если за 30 сек тир не сменился — пишем "проверь позже".
  const handlePayCard = useCallback(async (plan: StarsPlan) => {
    if (busyPlan) return;
    impactHaptic('medium');
    setBusyPlan(plan);
    setToast(null);

    try {
      const res = await createYookassaInvoice(plan);
      if (!res.ok || !res.confirmation_url) {
        notificationHaptic('error');
        setToast({ kind: 'error', text: res.error || 'Не удалось создать платёж' });
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
      // Polling — ждём пока вебхук активирует подписку
      setToast({ kind: 'success', text: 'Открываем оплату… После оплаты подписка активируется автоматически.' });
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const meRes = await getMe();
          if (meRes?.user?.tier && meRes.user.tier !== 'free') {
            notificationHaptic('success');
            await refresh();
            setToast({ kind: 'success', text: 'Подписка активирована' });
            setTimeout(() => closeAndBack(), 1200);
            return;
          }
        } catch (_) { /* продолжаем polling */ }
      }
      // Не дождались — оставляем экран открытым с подсказкой
      setToast({
        kind: 'success',
        text: 'Платёж в обработке. Если ты завершил оплату — обнови экран через минуту.',
      });
    } catch (err: any) {
      notificationHaptic('error');
      setToast({ kind: 'error', text: err?.message || 'Ошибка оплаты' });
    } finally {
      setBusyPlan(null);
    }
  }, [busyPlan, refresh, closeAndBack]);

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
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <h1 style={styles.heroTitle}>{heading}</h1>
        <p style={styles.heroSub}>{subheading}</p>
      </div>

      {/* Информация что в DEV/вне TG оплаты нет */}
      {!tgAvailable && (
        <div style={styles.warnBox}>
          Покупка Stars работает только в реальном Telegram. В обычном браузере экран показывается,
          но оплата недоступна.
        </div>
      )}

      {/* План карточки */}
      <div style={styles.plans}>
        {PLAN_CONFIGS.map(plan => (
          <PlanCard
            key={plan.id}
            cfg={plan}
            selected={selected === plan.id}
            onSelect={() => { impactHaptic('light'); setSelected(plan.id); }}
            onBuy={() => handleBuy(plan.id)}
            onBuyCard={YOOKASSA_ENABLED ? () => handlePayCard(plan.id) : undefined}
            busy={busyPlan === plan.id}
            disabled={busyPlan != null && busyPlan !== plan.id}
          />
        ))}

        {hasActiveSub && (
          <PlanCard
            cfg={{
              id: 'day_pass',
              title: 'Дневной пропуск',
              price: 50,
              badge: '24 часа',
              features: [
                'Без лимитов на 24 часа',
                'Действует поверх текущего тарифа',
              ],
            }}
            selected={selected === 'day_pass'}
            onSelect={() => { impactHaptic('light'); setSelected('day_pass'); }}
            onBuy={() => handleBuy('day_pass')}
            onBuyCard={YOOKASSA_ENABLED ? () => handlePayCard('day_pass') : undefined}
            busy={busyPlan === 'day_pass'}
            disabled={busyPlan != null && busyPlan !== 'day_pass'}
          />
        )}
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
        Оплата через Telegram Stars. Подписка действует 30 дней без автопродления.
        Чтобы вернуть Stars — напиши команду /paysupport в бот.
      </p>

      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.kind === 'success' ? 'var(--status-positive)' : 'var(--status-negative)',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Карточка тарифа ──────────────────────────────────────────────────────────

interface PlanCardProps {
  cfg: PlanConfig;
  selected: boolean;
  onSelect: () => void;
  onBuy: () => void;
  onBuyCard?: () => void; // если задан — показываем вторую кнопку «Купить картой»
  busy: boolean;
  disabled: boolean;
}

function PlanCard({ cfg, selected, onSelect, onBuy, onBuyCard, busy, disabled }: PlanCardProps) {
  // Рублёвая стоимость рядом со Stars — для прозрачности (~1.4 ₽/⭐).
  // Для day_pass и других — используем RUB_PRICES если есть, иначе считаем из курса.
  const rubFromPrices = RUB_PRICES[cfg.id];
  const rubApprox = rubFromPrices ?? Math.round(cfg.price * STARS_TO_RUB);

  return (
    <div
      onClick={onSelect}
      style={{
        ...styles.card,
        background: cfg.highlight ? 'var(--accent-soft)' : 'var(--bg-card)',
        borderColor: selected
          ? 'var(--accent-primary)'
          : cfg.highlight
            ? 'var(--border-accent)'
            : 'var(--border-subtle)',
        boxShadow: selected ? 'var(--glow-accent)' : undefined,
      }}
    >
      <div style={styles.cardHead}>
        <div>
          <span style={styles.planTitle}>{cfg.title}</span>
          {cfg.badge && (
            <span style={{
              ...styles.badge,
              background: cfg.badgeAccent ? 'var(--gradient-accent)' : 'var(--bg-elevated)',
              color: cfg.badgeAccent ? '#fff' : 'var(--text-secondary)',
            }}>{cfg.badge}</span>
          )}
        </div>
        <div style={styles.priceCol}>
          <div style={styles.priceWrap}>
            <span style={styles.priceNum}>{cfg.price}</span>
            <span style={styles.priceUnit}>⭐</span>
          </div>
          <span style={styles.priceRub}>≈ {rubApprox} ₽</span>
        </div>
      </div>

      <ul style={styles.features}>
        {cfg.features.map(f => (
          <li key={f} style={styles.feature}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--status-positive)"
                 strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12" />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={(e) => { e.stopPropagation(); if (!busy && !disabled) onBuy(); }}
        disabled={busy || disabled}
        style={{
          ...styles.buyBtn,
          background: cfg.highlight ? 'var(--gradient-accent)' : 'var(--bg-elevated)',
          color: cfg.highlight ? '#fff' : 'var(--text-primary)',
          opacity: (busy || disabled) ? 0.6 : 1,
        }}
      >
        {busy ? 'Открываем оплату…' : `Купить за ${cfg.price} ⭐`}
      </button>

      {onBuyCard && (
        <button
          onClick={(e) => { e.stopPropagation(); if (!busy && !disabled) onBuyCard(); }}
          disabled={busy || disabled}
          style={{
            ...styles.buyCardBtn,
            opacity: (busy || disabled) ? 0.6 : 1,
          }}
        >
          Купить за {rubApprox} ₽ картой
        </button>
      )}
    </div>
  );
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
  },
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },

  hero: {
    padding: '20px 20px 24px',
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
    fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
  },
  heroSub: {
    margin: '8px auto 0',
    maxWidth: 320,
    fontSize: 14, lineHeight: '20px',
    color: 'var(--text-secondary)',
  },

  warnBox: {
    margin: '0 20px 16px',
    padding: '10px 12px',
    fontSize: 12, lineHeight: '18px',
    background: 'rgba(245,158,11,0.10)',
    border: '1px solid rgba(245,158,11,0.30)',
    color: 'var(--status-warning)',
    borderRadius: 12,
  },

  plans: {
    padding: '0 16px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },

  card: {
    border: '1.5px solid',
    borderRadius: 18,
    padding: 16,
    cursor: 'pointer',
    transition: 'border-color 160ms, box-shadow 160ms',
  },
  cardHead: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 12,
  },
  planTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  badge: {
    display: 'inline-block',
    marginLeft: 8,
    padding: '3px 8px',
    fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
    borderRadius: 6,
    verticalAlign: 'middle',
  },
  priceCol:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  priceWrap: { display: 'inline-flex', alignItems: 'baseline', gap: 2 },
  priceNum:  { fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' },
  priceUnit: { fontSize: 18, color: 'var(--coin)' },
  priceRub:  { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 },

  features: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  feature: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    fontSize: 13, lineHeight: '18px', color: 'var(--text-secondary)',
  },

  buyBtn: {
    marginTop: 14,
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    fontSize: 15, fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 160ms',
  },

  buyCardBtn: {
    marginTop: 8,
    width: '100%',
    padding: '11px 16px',
    borderRadius: 12,
    fontSize: 14, fontWeight: 600,
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    cursor: 'pointer',
    transition: 'opacity 160ms',
  },

  extra: {
    marginTop: 20,
    padding: '0 20px',
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  linkBtn: {
    background: 'none',
    color: 'var(--text-accent)',
    fontSize: 13, fontWeight: 500,
    padding: 4,
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
    color: '#fff',
    fontSize: 14, fontWeight: 600,
    textAlign: 'center',
    zIndex: 100,
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
  },
};

export default PaywallScreen;
