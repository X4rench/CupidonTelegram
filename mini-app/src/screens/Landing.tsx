// ═══════════════════════════════════════════════════════════════
// Landing — публичная страница вне Telegram (cupidonapp.ru / cupidonai.ru).
//
// Показывается когда сайт открыт в обычном браузере или его тянет краулер
// (без initData). КРИТИЧНО для Google Safe Browsing: реальный контент +
// юр-данные + legal-ссылки = легит-сигнал, который держит домен вне списка
// «мошеннических». НЕ редиректить отсюда в мессенджер. Должна:
//   1. Объяснить что это за сервис (для модератора ЮКассы и SEO)
//   2. Показать цены подписки
//   3. Дать ссылки на Privacy и Terms
//   4. Кнопка перехода в Telegram
//   5. Контакты исполнителя
// ═══════════════════════════════════════════════════════════════
import { useNavigate } from 'react-router-dom';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'Cupidon_Ai_Bot';
const MINIAPP_LINK = `https://t.me/${BOT_USERNAME}/app`;

const STARS_TO_RUB = parseFloat(import.meta.env.VITE_STARS_TO_RUB || '1.4');
const RUB = {
  basic:    parseInt(import.meta.env.VITE_RUB_PRICE_BASIC || '0', 10) || Math.round(199 * STARS_TO_RUB),
  premium:  parseInt(import.meta.env.VITE_RUB_PRICE_PREMIUM || '0', 10) || Math.round(499 * STARS_TO_RUB),
  day_pass: parseInt(import.meta.env.VITE_RUB_PRICE_DAY_PASS || '0', 10) || Math.round(50 * STARS_TO_RUB),
};

export function Landing() {
  const nav = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HERO */}
        <header style={styles.hero}>
          <div style={styles.logo}>💘</div>
          <h1 style={styles.h1}>Купидон</h1>
          <p style={styles.tagline}>
            AI-коуч по знакомствам и общению в&nbsp;Telegram
          </p>
          <a href={MINIAPP_LINK} style={styles.ctaPrimary}>
            Открыть в Telegram
          </a>
        </header>

        {/* WHAT */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Что это</h2>
          <p style={styles.lead}>
            Купидон — это AI-ассистент для парней, которые хотят
            научиться лучше общаться в дейтинг-приложениях и&nbsp;в&nbsp;жизни.
            Работает внутри Telegram как Mini App.
          </p>
        </section>

        {/* FEATURES */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Что умеет</h2>
          <div style={styles.featuresGrid}>
            <Feature emoji="🎯" title="Анализ переписки">
              Вставь чат — AI скажет где ты теряешь интерес и&nbsp;даст варианты ответов.
            </Feature>
            <Feature emoji="💬" title="Симулятор знакомства">
              AI отыграет роль девушки разного типажа. В&nbsp;конце — разбор твоих ходов.
            </Feature>
            <Feature emoji="✨" title="Первое сообщение">
              3 варианта первого сообщения по&nbsp;её&nbsp;профилю. Не&nbsp;«привет, как дела».
            </Feature>
            <Feature emoji="🛡️" title="Разбор отказа">
              AI разберёт где ты сорвался и&nbsp;какие принципы стоит запомнить.
            </Feature>
            <Feature emoji="💜" title="Поддержи её">
              3-5 поддерживающих сообщений, если у&nbsp;неё что-то случилось.
            </Feature>
            <Feature emoji="📚" title="Теория и сообщество">
              Короткие принципы общения + лента диалогов других ребят с&nbsp;разбором.
            </Feature>
          </div>
        </section>

        {/* PRICING */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Тарифы</h2>
          <p style={styles.lead}>
            Все цифровые услуги. Доступ открывается мгновенно после оплаты.
          </p>
          <div style={styles.plansGrid}>
            <PlanCard
              name="Basic"
              priceStars={199}
              priceRub={RUB.basic}
              features={[
                '30 AI-запросов в день',
                'Все инструменты кроме NSFW',
                '30 дней',
              ]}
            />
            <PlanCard
              name="Premium"
              accent
              priceStars={499}
              priceRub={RUB.premium}
              features={[
                '100 AI-запросов в день',
                'Все инструменты + NSFW',
                'Приоритетная обработка',
                '30 дней',
              ]}
            />
            <PlanCard
              name="Дневной пропуск"
              priceStars={50}
              priceRub={RUB.day_pass}
              features={[
                'Безлимит AI-запросов на 24 часа',
                'Требует активной подписки Basic/Premium',
              ]}
            />
          </div>
          <p style={styles.tinyNote}>
            Оплата: Telegram Stars (XTR) или банковской картой через ЮKassa
            (Visa / MasterCard / МИР). Возврат — в&nbsp;соответствии с&nbsp;Законом
            РФ «О&nbsp;защите прав потребителей».
          </p>
        </section>

        {/* LEGAL */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Юридическая информация</h2>
          <p style={styles.lead}>
            <strong>Исполнитель:</strong> Капустин Роман Денисович, самозанятый
            (плательщик НПД)<br />
            <strong>ИНН:</strong> 421212787931<br />
            <strong>E-mail:</strong> apppartners@mail.ru
          </p>
          <div style={styles.legalLinks}>
            <button onClick={() => nav('/terms')} style={styles.legalLink}>
              Условия использования (оферта)
            </button>
            <button onClick={() => nav('/privacy')} style={styles.legalLink}>
              Политика конфиденциальности
            </button>
          </div>
        </section>

        {/* FOOTER CTA */}
        <section style={{ ...styles.section, marginTop: 40 }}>
          <div style={styles.footerCta}>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--text-secondary)' }}>
              Готов попробовать?
            </p>
            <a href={MINIAPP_LINK} style={styles.ctaPrimary}>
              Открыть в Telegram
            </a>
          </div>
        </section>

        <footer style={styles.footer}>
          © 2026 Капустин Р. Д. (ИНН 421212787931).
          Все права защищены. Сервис работает в&nbsp;соответствии
          с&nbsp;законодательством Российской Федерации.
        </footer>
      </div>
    </div>
  );
}

function Feature({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div style={styles.feature}>
      <div style={styles.featureEmoji}>{emoji}</div>
      <div style={styles.featureTitle}>{title}</div>
      <div style={styles.featureText}>{children}</div>
    </div>
  );
}

function PlanCard({
  name, priceStars, priceRub, features, accent,
}: {
  name: string;
  priceStars: number;
  priceRub: number;
  features: string[];
  accent?: boolean;
}) {
  return (
    <div style={{ ...styles.plan, ...(accent ? styles.planAccent : {}) }}>
      <div style={styles.planName}>{name}</div>
      <div style={styles.planPrice}>
        <span style={styles.planRub}>{priceRub} ₽</span>
        <span style={styles.planStars}> / {priceStars} ⭐</span>
      </div>
      <ul style={styles.planFeatures}>
        {features.map((f, i) => <li key={i} style={styles.planLi}>{f}</li>)}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  container: {
    maxWidth: 920,
    margin: '0 auto',
    padding: '40px 20px 60px',
  },

  hero: {
    textAlign: 'center',
    padding: '40px 0 32px',
  },
  logo: {
    fontSize: 72,
    lineHeight: 1,
    marginBottom: 16,
  },
  h1: {
    margin: 0,
    fontSize: 42,
    fontWeight: 700,
    background: 'var(--gradient-accent)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  tagline: {
    marginTop: 12,
    fontSize: 18,
    color: 'var(--text-secondary)',
    maxWidth: 480,
    marginLeft: 'auto',
    marginRight: 'auto',
    lineHeight: 1.5,
  },
  ctaPrimary: {
    display: 'inline-block',
    marginTop: 24,
    padding: '14px 32px',
    background: 'var(--gradient-accent)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 14,
    textDecoration: 'none',
    boxShadow: 'var(--glow-accent)',
  },

  section: {
    marginTop: 40,
  },
  h2: {
    margin: '0 0 16px',
    fontSize: 24,
    fontWeight: 700,
  },
  lead: {
    margin: 0,
    fontSize: 16,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },

  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
    marginTop: 16,
  },
  feature: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    padding: 20,
  },
  featureEmoji: { fontSize: 32, marginBottom: 8 },
  featureTitle: { fontSize: 17, fontWeight: 600, marginBottom: 6 },
  featureText: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 },

  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
    marginTop: 16,
  },
  plan: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    padding: 24,
  },
  planAccent: {
    border: '1px solid var(--border-accent)',
    background: 'var(--accent-soft)',
  },
  planName: {
    fontSize: 14,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    letterSpacing: 0.5,
  },
  planPrice: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap' as const,
  },
  planRub: { fontSize: 28, fontWeight: 700 },
  planStars: { fontSize: 14, color: 'var(--text-muted)', marginLeft: 8 },
  planFeatures: { margin: '14px 0 0', paddingLeft: 0, listStyle: 'none' },
  planLi: {
    fontSize: 14,
    padding: '4px 0',
    color: 'var(--text-secondary)',
    position: 'relative' as const,
    paddingLeft: 22,
  },

  tinyNote: {
    marginTop: 16,
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },

  legalLinks: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 16,
  },
  legalLink: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-accent)',
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    cursor: 'pointer',
  },

  footerCta: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 12,
    padding: 32,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    textAlign: 'center' as const,
  },

  footer: {
    marginTop: 60,
    paddingTop: 24,
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    textAlign: 'center' as const,
  },
};
