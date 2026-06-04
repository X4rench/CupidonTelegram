// ═══════════════════════════════════════════════════════════════
// IOSPasteHint — подсказка под textarea для iOS-пользователей.
//
// На iOS Apple WKWebView режет multi-line paste из других приложений
// до первой строки. Это политика конфиденциальности iOS, мы не можем
// её обойти из JS. См. issue #609 в Telegram-Mini-Apps/telegram-apps.
//
// Показываем СРАЗУ (не свёрнуто) — чтобы юзер не потратил время на
// попытки и не подумал что у него всё ОК после вставки одной строки.
// Только iOS — на Android/Desktop её нет.
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties } from 'react';
import { isTelegramIOS } from './AutoGrowTextarea';

export function IOSPasteHint() {
  if (!isTelegramIOS()) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>
        <span style={styles.icon}>📱</span>
        <span>Ты на iPhone — есть нюанс</span>
      </div>
      <div style={styles.body}>
        Попробуй сейчас скопировать всю переписку из чата и вставить сюда.
        Вставится только <b>первое сообщение</b> — это ограничение Apple
        iOS, оно блокирует вставку из других приложений. Обойти из браузера
        нельзя.
        <br/><br/>
        <b>Что делать:</b>
        <ul style={styles.list}>
          <li>Самый быстрый — открой Купидон через <b>Telegram Desktop</b> или с <b>Android</b>: там вставится вся переписка сразу.</li>
          <li>На iPhone — вставляй по <b>одному сообщению</b>: вставил, нажми Enter для новой строки, снова Paste, и так далее.</li>
        </ul>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    marginTop: 10,
    padding: '10px 12px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: '17px',
    color: 'var(--text-secondary)',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--status-warning, #F59E0B)',
    marginBottom: 6,
  },
  icon: {
    fontSize: 14,
    lineHeight: 1,
  },
  body: {
    fontSize: 12,
    lineHeight: '17px',
    color: 'var(--text-secondary)',
  },
  list: {
    margin: '4px 0 0 0',
    paddingLeft: 18,
  },
};
