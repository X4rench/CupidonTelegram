// ═══════════════════════════════════════════════════════════════
// IOSPasteHint — компактная подсказка под textarea для iOS-пользователей.
//
// На iOS Apple WKWebView режет multi-line paste из других приложений
// до первой строки. Это политика конфиденциальности iOS, мы не можем
// её обойти из JS. См. issue #609 в Telegram-Mini-Apps/telegram-apps.
//
// Подсказка отображается ТОЛЬКО на iOS — на Android/Desktop её нет
// (там paste работает нативно без проблем).
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { isTelegramIOS } from './AutoGrowTextarea';

export function IOSPasteHint() {
  const [expanded, setExpanded] = useState(false);
  if (!isTelegramIOS()) return null;

  return (
    <div style={styles.wrap}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={styles.toggleBtn}
      >
        <span style={styles.icon}>ⓘ</span>
        <span>Не вставляется вся переписка с iPhone?</span>
        <span style={{ ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ›
        </span>
      </button>
      {expanded && (
        <div style={styles.body}>
          На iPhone Apple ограничивает вставку нескольких строк из других
          приложений (политика приватности). Это не наша ошибка — обойти
          из приложения нельзя.
          <br/><br/>
          <b>Способы вставить переписку целиком:</b>
          <ul style={styles.list}>
            <li>Открой Купидон на <b>компьютере</b> через Telegram Desktop — там работает.</li>
            <li>Или на <b>Android</b> — там тоже без ограничений.</li>
            <li>На iPhone — можно вставлять <b>по одному сообщению</b>: вставил, на новой строке снова Paste, и так далее.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    marginTop: 8,
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  toggleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 0,
    padding: 0,
    fontSize: 12,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  icon: {
    width: 14, height: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%',
    border: '1px solid var(--text-muted)',
    fontSize: 10,
    lineHeight: 1,
  },
  chevron: {
    display: 'inline-block',
    fontSize: 14,
    transition: 'transform 160ms',
    color: 'var(--text-muted)',
  },
  body: {
    marginTop: 8,
    padding: '10px 12px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: '18px',
    color: 'var(--text-secondary)',
  },
  list: {
    margin: '6px 0 0 0',
    paddingLeft: 18,
  },
};
