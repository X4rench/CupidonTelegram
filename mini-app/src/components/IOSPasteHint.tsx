// ═══════════════════════════════════════════════════════════════
// IOSPasteHint — компактная свёрнутая ссылка под textarea для
// iOS-пользователей. По умолчанию — только маленький текст-ссылка,
// тап → раскрывается с лайфхаком через Избранное.
//
// Логика показа:
//   - НЕ iOS → null (Android/Desktop вообще ничего не видят)
//   - iOS, свёрнуто → одна строка-toggler «Не вставилась вся переписка?»
//   - iOS, развёрнуто → пошаговый лайфхак
//
// Apple WKWebView блокирует paste нескольких TG-сообщений сразу, но
// ОДНО TG-сообщение (даже multi-line) копируется без проблем.
// Поэтому юзер пересылает переписку в Избранное → получает одно
// сообщение → копирует его → вставляет в Купидон.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { isTelegramIOS } from './AutoGrowTextarea';
import { selectionHaptic } from '../utils/haptics';

export function IOSPasteHint() {
  const [open, setOpen] = useState(false);
  if (!isTelegramIOS()) return null;

  const toggle = () => { selectionHaptic(); setOpen(v => !v); };

  const openSaved = () => {
    selectionHaptic();
    const tg: any = (window as any)?.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      try { tg.openTelegramLink('https://t.me/+42777'); return; } catch (_) {}
    }
    window.open('https://t.me/+42777', '_blank');
  };

  return (
    <div style={styles.wrap}>
      <button type="button" onClick={toggle} style={styles.toggler}>
        <span style={styles.togglerIcon}>ⓘ</span>
        <span>Не вставилась вся переписка?</span>
        <span style={{
          ...styles.chevron,
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>›</span>
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHead}>
            iPhone Apple позволяет вставить только <b>первое</b>
            сообщение из чата. Самый быстрый обход:
          </div>

          <Step n={1}>
            В чате <b>выдели</b> переписку (зажми сообщение → выдели
            остальные галочками) → <b>«Копировать»</b>
          </Step>
          <Step n={2}>
            Открой <b>Избранное</b> (чат с собой) и <b>вставь</b> туда —
            получится одно длинное сообщение со всей перепиской.
            <button type="button" onClick={openSaved} style={styles.openBtn}>
              Открыть Избранное →
            </button>
          </Step>
          <Step n={3}>
            Зажми это сообщение → <b>«Копировать»</b>. Вернись сюда
            → вставь. Теперь придёт целиком.
          </Step>

          <div style={styles.footer}>
            Или открой Купидон с <b>компьютера</b> / <b>Android</b> —
            там вставка работает сразу.
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: any }) {
  return (
    <div style={styles.step}>
      <span style={styles.stepNum}>{n}</span>
      <span style={styles.stepText}>{children}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    marginTop: 6,
  },
  toggler: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    fontSize: 11,
    color: 'var(--text-muted)',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    textAlign: 'left',
  },
  togglerIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 13, height: 13,
    borderRadius: '50%',
    border: '1px solid var(--text-muted)',
    fontSize: 9,
    lineHeight: 1,
    flexShrink: 0,
  },
  chevron: {
    display: 'inline-block',
    fontSize: 13,
    lineHeight: 1,
    color: 'var(--text-muted)',
    transition: 'transform 160ms',
  },
  panel: {
    marginTop: 6,
    padding: '10px 12px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: '17px',
    color: 'var(--text-secondary)',
  },
  panelHead: {
    marginBottom: 8,
  },
  step: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  stepNum: {
    flexShrink: 0,
    width: 18, height: 18,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    lineHeight: '17px',
    color: 'var(--text-secondary)',
  },
  openBtn: {
    display: 'inline-block',
    marginTop: 4,
    marginLeft: 0,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-accent)',
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  footer: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 11,
    color: 'var(--text-muted)',
  },
};
