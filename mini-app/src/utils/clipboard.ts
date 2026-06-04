// ═══════════════════════════════════════════════════════════════
// Универсальное чтение буфера обмена с фолбэками.
//
// На iOS Telegram WebView обычный paste event НЕ передаёт multi-line
// текст в clipboardData (политика приватности Apple). Единственный
// надёжный способ — Telegram WebApp method `readTextFromClipboard`
// (через native bridge UIPasteboard), доступен с Bot API >= 6.4.
//
// Бывают случаи когда этот метод возвращает пустую строку даже когда
// в буфере что-то есть:
//   - User отказал в разрешении на доступ к буферу (iOS dialog)
//   - TG Mini App не активен (фокус потерян)
//   - Источник буфера — другое iOS приложение в защищённом режиме
//
// Поэтому возвращаем структурированный результат с детальной диагностикой,
// чтобы можно было показать осмысленное сообщение пользователю.
// ═══════════════════════════════════════════════════════════════

export interface ClipboardReadResult {
  text: string | null;
  /** Что именно произошло — для отображения пользователю. */
  reason:
    | 'ok'                  // text получен (text не null)
    | 'empty'               // буфер реально пуст
    | 'denied'              // user отказал в доступе на iOS
    | 'unsupported'         // API недоступен в этой версии Telegram/браузере
    | 'timeout'             // callback не пришёл за разумное время
    | 'error';              // exception
  /** Какой путь сработал — для отладки. */
  via?: 'tg-webapp' | 'navigator-async';
  /** Доп. info для console.log. */
  debug?: Record<string, any>;
}

/**
 * Прочитать текст из системного буфера.
 * Должна вызываться в обработчике пользовательского действия (click/tap).
 */
export async function readClipboard(): Promise<ClipboardReadResult> {
  const tg: any = (window as any)?.Telegram?.WebApp;
  const debug: Record<string, any> = {
    tg_version: tg?.version || 'unknown',
    tg_platform: tg?.platform || 'unknown',
    has_readTextFromClipboard: typeof tg?.readTextFromClipboard === 'function',
    has_navigator_clipboard: !!navigator.clipboard && typeof navigator.clipboard.readText === 'function',
    is_secure_context: typeof window !== 'undefined' && (window as any).isSecureContext === true,
  };

  // 1. Telegram WebApp API
  if (tg && typeof tg.readTextFromClipboard === 'function') {
    try {
      const result = await new Promise<{ text: string | null; reason: 'ok' | 'empty' | 'timeout' }>((resolve) => {
        let done = false;
        const finish = (r: { text: string | null; reason: 'ok' | 'empty' | 'timeout' }) => {
          if (done) return;
          done = true;
          resolve(r);
        };
        // На iOS bridge может показывать системный dialog «Paste from … to Telegram»
        // — user должен тапнуть Allow. Даём до 8 секунд.
        const timeout = setTimeout(
          () => finish({ text: null, reason: 'timeout' }),
          8000,
        );

        // Двойная подписка: 1) callback (Bot API 6.4+), 2) event-based
        // (старые TG). Что сработает первым — то и берём.
        const onEvent = (event: any) => {
          // event.data — string | null
          try {
            const t = event?.data;
            clearTimeout(timeout);
            if (typeof t === 'string' && t.length > 0) {
              finish({ text: t, reason: 'ok' });
            } else {
              finish({ text: null, reason: 'empty' });
            }
            try { tg.offEvent && tg.offEvent('clipboard_text_received', onEvent); } catch (_) {}
          } catch (_) { finish({ text: null, reason: 'empty' }); }
        };
        try { tg.onEvent && tg.onEvent('clipboard_text_received', onEvent); } catch (_) {}

        try {
          // callback может НЕ быть вызван на старых TG — тогда сработает event
          tg.readTextFromClipboard((t: string | null) => {
            clearTimeout(timeout);
            try { tg.offEvent && tg.offEvent('clipboard_text_received', onEvent); } catch (_) {}
            if (t == null) {
              finish({ text: null, reason: 'empty' });
              return;
            }
            if (typeof t === 'string' && t.length > 0) {
              finish({ text: t, reason: 'ok' });
            } else {
              finish({ text: null, reason: 'empty' });
            }
          });
        } catch (e: any) {
          clearTimeout(timeout);
          debug.tg_exception = e?.message || String(e);
          finish({ text: null, reason: 'empty' });
        }
      });
      debug.tg_result = result.reason;
      if (result.text && result.reason === 'ok') {
        return { text: result.text, reason: 'ok', via: 'tg-webapp', debug };
      }
      // Если TG вернул пусто — пробуем navigator API как fallback
      // (на десктопе с TG Web это работает)
    } catch (e: any) {
      debug.tg_outer_exception = e?.message || String(e);
    }
  }

  // 2. Стандартный async clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const text = await navigator.clipboard.readText();
      debug.nav_result_length = text?.length || 0;
      if (typeof text === 'string' && text.length > 0) {
        return { text, reason: 'ok', via: 'navigator-async', debug };
      }
      return { text: null, reason: 'empty', debug };
    } catch (e: any) {
      debug.nav_exception = e?.message || String(e);
      // На iOS Safari WKWebView readText бросает NotAllowedError если нет gesture
      // или DOMException если permission запрещён.
      return { text: null, reason: 'denied', debug };
    }
  }

  return { text: null, reason: 'unsupported', debug };
}

/** Проверить — поддерживается ли вообще чтение буфера в данной среде. */
export function isClipboardReadSupported(): boolean {
  const tg: any = (window as any)?.Telegram?.WebApp;
  if (tg && typeof tg.readTextFromClipboard === 'function') return true;
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') return true;
  return false;
}

/** Человекочитаемое сообщение для UI по результату чтения. */
export function clipboardErrorMessage(reason: ClipboardReadResult['reason']): string {
  switch (reason) {
    case 'empty':       return 'Буфер обмена пуст. Скопируй текст и попробуй снова.';
    case 'denied':      return 'Доступ к буферу запрещён. Разреши в настройках iOS.';
    case 'unsupported': return 'Эта версия Telegram не поддерживает чтение буфера. Обнови приложение.';
    case 'timeout':     return 'Не дождались ответа от системы. Попробуй ещё раз.';
    case 'error':       return 'Ошибка чтения буфера. Попробуй ещё раз.';
    default:            return 'Неизвестная ошибка';
  }
}
