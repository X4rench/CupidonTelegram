// ═══════════════════════════════════════════════════════════════
// IOSPasteHint — подсказка под textarea для iOS-пользователей.
//
// На iOS Apple WKWebView блокирует multi-line paste при копировании
// нескольких отдельных сообщений из TG-чата. НО — если переписка
// сложена в ОДНО сообщение (например, в Избранном), то её копирование
// и вставка работает нормально: Apple режет только cross-source paste,
// а одно TG-сообщение это «один source».
//
// Поэтому даём пользователю конкретный лайфхак: вставить переписку
// в Избранное (Saved Messages) → получить одно длинное сообщение →
// скопировать его → вставить в Купидон.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { isTelegramIOS } from './AutoGrowTextarea';
import { selectionHaptic } from '../utils/haptics';

export function IOSPasteHint() {
  const [step, setStep] = useState<'lifehack' | 'other' | null>('lifehack');
  if (!isTelegramIOS()) return null;

  const openSaved = () => {
    selectionHaptic();
    const tg: any = (window as any)?.Telegram?.WebApp;
    // Открываем «Избранное» (Saved Messages) — это чат с самим собой
    if (tg?.openTelegramLink) {
      try { tg.openTelegramLink('https://t.me/+42777'); return; } catch (_) {}
      try { tg.openTelegramLink('tg://resolve?domain=Saved+Messages'); return; } catch (_) {}
    }
    // Fallback — пусть TG сам обработает
    window.open('https://t.me/+42777', '_blank');
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>
        <span style={styles.icon}>📱</span>
        <span>Лайфхак для iPhone</span>
      </div>

      <div style={styles.body}>
        Если ты выделишь и скопируешь сразу несколько сообщений из
        чата — iPhone вставит только <b>первое</b>. Это блок Apple,
        мы его не обойдём из приложения. Но есть способы.
      </div>

      <div style={styles.tabs}>
        <button
          type="button"
          onClick={() => setStep('lifehack')}
          style={{
            ...styles.tabBtn,
            ...(step === 'lifehack' ? styles.tabBtnActive : {}),
          }}
        >
          🪄 Лайфхак за 10 секунд
        </button>
        <button
          type="button"
          onClick={() => setStep('other')}
          style={{
            ...styles.tabBtn,
            ...(step === 'other' ? styles.tabBtnActive : {}),
          }}
        >
          Другие способы
        </button>
      </div>

      {step === 'lifehack' && (
        <div style={styles.steps}>
          <Step n={1}>
            В Telegram-чате <b>выдели</b> сообщения с перепиской
            (зажми любое сообщение → выдели остальные галочками).
          </Step>
          <Step n={2}>
            Нажми <b>«Копировать»</b> (иконка скрепки внизу).
          </Step>
          <Step n={3}>
            Открой <b>Избранное</b> — это чат с самим собой.
            <button type="button" onClick={openSaved} style={styles.openBtn}>
              Открыть Избранное →
            </button>
          </Step>
          <Step n={4}>
            <b>Вставь</b> в поле ввода Избранного. Получится <b>одно
            длинное сообщение</b> со всей перепиской.
          </Step>
          <Step n={5}>
            <b>Отправь</b> его (или просто оставь в поле ввода).
            Зажми → <b>«Копировать»</b>.
          </Step>
          <Step n={6}>
            Вернись сюда в Купидон → зажми поле ввода → <b>«Вставить»</b>.
            Теперь Apple отдаст всё — потому что копируется уже
            <b> одно</b> сообщение, а не пачка.
          </Step>
        </div>
      )}

      {step === 'other' && (
        <div style={styles.other}>
          <div style={styles.otherItem}>
            <b>💻 Telegram Desktop</b> — открой Купидон с компьютера,
            там вставка работает сразу.
          </div>
          <div style={styles.otherItem}>
            <b>🤖 Android</b> — на Android Telegram нет ограничений,
            тоже сразу.
          </div>
          <div style={styles.otherItem}>
            <b>📝 По одному сообщению</b> — вставь первое, тапни Enter
            для новой строки, ещё раз Paste — второе. И так далее.
            Долго, но работает на iPhone.
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
    marginTop: 10,
    padding: '12px 14px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.28)',
    borderRadius: 12,
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
  icon: { fontSize: 14, lineHeight: 1 },
  body: {
    fontSize: 12,
    lineHeight: '17px',
    color: 'var(--text-secondary)',
    marginBottom: 10,
  },
  tabs: {
    display: 'flex',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  tabBtn: {
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 600,
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 160ms, color 160ms, border-color 160ms',
  },
  tabBtnActive: {
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    borderColor: 'var(--border-accent)',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  step: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepNum: {
    flexShrink: 0,
    width: 20, height: 20,
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
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-accent)',
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  other: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  otherItem: {
    fontSize: 12,
    lineHeight: '17px',
    color: 'var(--text-secondary)',
  },
};
