// ═══════════════════════════════════════════════════════════════
// Универсальное чтение буфера обмена с фолбэками.
//
// На iOS Telegram WebView обычный paste event НЕ передаёт multi-line
// текст в clipboardData (политика приватности Apple). Единственный
// надёжный способ — Telegram WebApp method `readTextFromClipboard`
// (через native bridge UIPasteboard).
//
// Иерархия фолбэков:
//   1. Telegram.WebApp.readTextFromClipboard — iOS/Android TG-WebView
//   2. navigator.clipboard.readText — современные браузеры (требует
//      user gesture, может бросить NotAllowedError)
//   3. document.execCommand('paste') — legacy, давно deprecated
//
// Используется кнопкой «Вставить» рядом с textarea для multi-line вставок.
// ═══════════════════════════════════════════════════════════════

/**
 * Прочитать текст из системного буфера. Возвращает строку или null.
 * Должна вызываться в обработчике пользовательского действия (click/tap),
 * иначе iOS Safari отклонит запрос.
 */
export async function readClipboard(): Promise<string | null> {
  // 1. Telegram WebApp API — самый надёжный на iOS/Android внутри Telegram
  const tg: any = (window as any)?.Telegram?.WebApp;
  if (tg && typeof tg.readTextFromClipboard === 'function') {
    try {
      const text = await new Promise<string | null>((resolve) => {
        // Bot API >= 6.4 — readTextFromClipboard(callback)
        // На старых клиентах метод может молча игнорироваться → защитный таймаут
        const timeout = setTimeout(() => resolve(null), 1500);
        try {
          tg.readTextFromClipboard((t: string) => {
            clearTimeout(timeout);
            resolve(typeof t === 'string' && t.length > 0 ? t : null);
          });
        } catch (_) {
          clearTimeout(timeout);
          resolve(null);
        }
      });
      if (text) return text;
    } catch (_) { /* падаем дальше */ }
  }

  // 2. Стандартный async clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string' && text.length > 0) return text;
    } catch (_) { /* permission denied / not allowed */ }
  }

  // 3. Совсем ничего не получилось
  return null;
}

/** Проверить — поддерживается ли вообще чтение буфера в данной среде. */
export function isClipboardReadSupported(): boolean {
  const tg: any = (window as any)?.Telegram?.WebApp;
  if (tg && typeof tg.readTextFromClipboard === 'function') return true;
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') return true;
  return false;
}
