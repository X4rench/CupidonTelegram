// ═══════════════════════════════════════════════════════════════
// Landing — fallback страница для случая когда Mini App открыт
// НЕ через Telegram (нет initData).
//
// В DEV / при проблемах — показывает debug-инфо снизу чтобы видеть
// причину (window.Telegram не загрузился? скрипт не подгрузился?).
// ═══════════════════════════════════════════════════════════════
import { getAuthDebugInfo } from '../auth';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'Cupidon_Ai_Bot';

export function Landing() {
  const debug = getAuthDebugInfo();

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

      {/* Debug-инфо для диагностики (видно прямо на экране, без DevTools) */}
      <div style={{
        marginTop: 40,
        padding: 12,
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11,
        color: 'var(--text-muted)',
        textAlign: 'left',
        maxWidth: 360,
        width: '100%',
        wordBreak: 'break-all',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
          🔧 Debug info
        </div>
        <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
{JSON.stringify(debug, null, 2)}
        </pre>
        <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 10 }}>
          UA: {navigator.userAgent.slice(0, 80)}…
        </div>
      </div>
    </div>
  );
}
