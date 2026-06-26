// ═══════════════════════════════════════════════════════════════
// Landing — публичная страница вне Telegram (cupidonapp.ru / будущий домен).
//
// КРИТИЧНО для Google Safe Browsing: эту страницу видит ТОЛЬКО краулер и
// случайный браузер — реальные юзеры работают внутри Telegram и её не видят.
// Поэтому страница НЕЙТРАЛЬНАЯ и «корпоративная»: описание сервиса + юр-данные
// + ссылки на Политику/Условия. БЕЗ дейтинг-подачи, БЕЗ цен и продаж, БЕЗ
// форм ввода. Это снижает риск пометки «мошеннический сайт» (профиль
// «дейтинг + оплата + новый домен» классификатор Google флагает агрессивно).
// Цены/оферта для модерации ЮКассы живут на платёжном домене, не здесь.
// НЕ редиректить отсюда в мессенджер.
// ═══════════════════════════════════════════════════════════════
import { useNavigate } from 'react-router-dom';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'Cupidon_Ai_Bot';
const MINIAPP_LINK = `https://t.me/${BOT_USERNAME}/app`;

export function Landing() {
  const nav = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* HERO */}
        <header style={styles.hero}>
          <h1 style={styles.h1}>Купидон</h1>
          <p style={styles.tagline}>
            Обучающий сервис-ассистент для развития навыков общения
          </p>
          <a href={MINIAPP_LINK} style={styles.ctaPrimary}>
            Открыть в Telegram
          </a>
        </header>

        {/* ABOUT */}
        <section style={styles.section}>
          <h2 style={styles.h2}>О сервисе</h2>
          <p style={styles.lead}>
            Купидон — обучающий сервис, который помогает развивать навыки
            общения и увереннее вести переписку. Работает внутри мессенджера
            Telegram как мини-приложение. Носит образовательный
            и&nbsp;развлекательный характер.
          </p>
        </section>

        {/* FEATURES */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Возможности</h2>
          <div style={styles.featuresGrid}>
            <Feature title="Разбор переписки">
              Сервис анализирует диалог и&nbsp;подсказывает, как сделать общение
              живее и&nbsp;естественнее.
            </Feature>
            <Feature title="Тренажёр диалога">
              Практика общения с&nbsp;виртуальным собеседником и&nbsp;разбор
              в&nbsp;конце.
            </Feature>
            <Feature title="Помощь с сообщениями">
              Идеи, как начать разговор и&nbsp;поддержать собеседника.
            </Feature>
            <Feature title="Теория общения">
              Короткие принципы и&nbsp;примеры для уверенного общения.
            </Feature>
          </div>
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
              Условия использования
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
              Сервис работает в&nbsp;Telegram
            </p>
            <a href={MINIAPP_LINK} style={styles.ctaPrimary}>
              Открыть в Telegram
            </a>
          </div>
        </section>

        <footer style={styles.footer}>
          © 2026 Капустин Р. Д. (ИНН 421212787931). Сервис работает
          в&nbsp;соответствии с&nbsp;законодательством Российской Федерации.
        </footer>
      </div>
    </div>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.feature}>
      <div style={styles.featureTitle}>{title}</div>
      <div style={styles.featureText}>{children}</div>
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
  h1: {
    margin: 0,
    fontSize: 42,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  tagline: {
    marginTop: 12,
    fontSize: 18,
    color: 'var(--text-secondary)',
    maxWidth: 520,
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
  featureTitle: { fontSize: 17, fontWeight: 600, marginBottom: 6 },
  featureText: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 },

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
