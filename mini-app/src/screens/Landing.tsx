// ═══════════════════════════════════════════════════════════════
// Landing — fallback страница для случая когда Mini App открыт
// НЕ через Telegram (нет initData). Показывает приглашение
// открыть бота.
// ═══════════════════════════════════════════════════════════════

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'CupidonAppBot';

export function Landing() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40, marginBottom: 24,
      }}>
        💘
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>
        Купидон
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 320, margin: '0 0 32px' }}>
        AI-коуч по знакомствам и флирту. Открой нас в Telegram, чтобы начать.
      </p>
      <a
        href={`https://t.me/${BOT_USERNAME}/app`}
        style={{
          display: 'inline-block',
          padding: '14px 28px',
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          color: '#fff',
          fontWeight: 600,
          borderRadius: 12,
          fontSize: 16,
        }}
      >
        Открыть в Telegram
      </a>
    </div>
  );
}
