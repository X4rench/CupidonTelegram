// ═══════════════════════════════════════════════════════════════
// AutoGrowTextarea — textarea, который сам растёт по высоте контента
// (паттерн §6.5 в TMA_PORTING_PLAYBOOK).
// Использует ref-измерение scrollHeight: сначала сбрасываем height до
// 'auto', затем выставляем = scrollHeight; max-height ограничивает рост.
//
// iOS paste fix (multi-line вставка):
// На Telegram iOS (WKWebView) дефолтная вставка multi-line текста в
// textarea с rows=1 обрезалась до первой строки. Причины:
//   1. WKWebView иногда не выставляет text/plain с \n — newlines уходят
//      в text/html как <br>.
//   2. React's onPaste может срабатывать ПОСЛЕ того как input event уже
//      применил обрезанное value.
//
// Решение:
//   - Native addEventListener('paste', ..., {capture: true}) — перехват
//     ДО React'овских обработчиков и применения дефолта в WebView.
//   - Парсим оба MIME: text/plain И text/html (с конвертацией <br>, <p>
//     в \n).
//   - Если оба возвращают однострочный текст (буфер реально однострочный),
//     не препятствуем дефолтному поведению.
//   - Fallback на navigator.clipboard.readText() async — если оба MIME
//     дали пусто. (Не блокирует UI — onChange произойдёт в then.)
// ═══════════════════════════════════════════════════════════════
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;     // Enter без Shift → submit
  placeholder?: string;
  maxLength?: number;
  maxHeight?: number;
  disabled?: boolean;
  style?: CSSProperties;
  autoFocus?: boolean;
}

export interface AutoGrowTextareaHandle {
  focus: () => void;
}

/**
 * Извлекаем multi-line текст из clipboardData. На iOS Telegram WebView
 * text/plain иногда содержит только первую строку, а \n уходят в text/html
 * как <br>. Парсим html и нормализуем в plain.
 */
function extractMultilineFromClipboard(cd: DataTransfer | null): string {
  if (!cd) return '';
  const plain = cd.getData('text/plain') || cd.getData('text') || '';
  const html  = cd.getData('text/html') || '';

  // Если в plain уже есть переносы — отлично, используем как есть.
  if (plain && (plain.includes('\n') || plain.includes('\r'))) return plain;

  // Иначе пробуем html.
  if (html) {
    const parsed = htmlToPlain(html);
    // Берём html-версию только если она ДЛИННЕЕ plain (т.е. содержит больше
    // информации). Иначе остаёмся с plain.
    if (parsed.length > plain.length) return parsed;
  }

  return plain;
}

/** HTML → plain: <br>/<p>/<div> в \n, остальные теги выкидываем. */
function htmlToPlain(html: string): string {
  // Заменяем явные блочные теги на переносы
  let s = html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<p[^>]*>|<div[^>]*>/gi, '');
  // Убираем оставшиеся теги
  s = s.replace(/<[^>]+>/g, '');
  // Декодируем основные HTML entities (минимально нужные)
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Нормализуем последовательности переносов
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

export const AutoGrowTextarea = forwardRef<AutoGrowTextareaHandle, Props>(function AutoGrowTextarea(
  { value, onChange, onSubmit, placeholder, maxLength, maxHeight = 120, disabled, style, autoFocus },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  // Стабильная ссылка на последний onChange — для native listener.
  const onChangeRef = useRef(onChange);
  const maxLenRef   = useRef(maxLength);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { maxLenRef.current = maxLength; }, [maxLength]);

  useImperativeHandle(ref, () => ({
    focus: () => innerRef.current?.focus(),
  }));

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  // Native paste handler в capture-фазе — срабатывает РАНЬШЕ React'а и
  // дефолтного поведения WebView. Это спасает iOS Telegram WKWebView,
  // где React'овский onPaste может прийти после уже-применённого input.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const handler = (e: ClipboardEvent) => {
      const text = extractMultilineFromClipboard(e.clipboardData);
      if (!text) {
        // Совсем пустой clipboard — fallback на async API.
        // (Не блокируем event — пусть default попробует.)
        return;
      }
      const hasNewlines = text.includes('\n') || text.includes('\r');
      const hasSelection = el.selectionStart !== el.selectionEnd;
      // Если в буфере нет переносов и нет выделения — даём дефолту работать
      // (нативная вставка короче — нормальное поведение, autocorrect ок).
      if (!hasNewlines && !hasSelection) return;

      e.preventDefault();
      e.stopPropagation();

      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd   ?? start;
      const before = el.value.slice(0, start);
      const after  = el.value.slice(end);
      let next = before + text + after;
      const ml = maxLenRef.current;
      if (typeof ml === 'number' && next.length > ml) next = next.slice(0, ml);

      // Двухступенчатая запись: сначала в DOM (textarea), потом — onChange.
      // Без записи в DOM React может перерендерить старое value поверх нашего.
      try { el.value = next; } catch (_) {}

      onChangeRef.current(next);

      // Позиция курсора — после вставленного фрагмента
      requestAnimationFrame(() => {
        const pos = Math.min(start + text.length, next.length);
        try { el.selectionStart = el.selectionEnd = pos; } catch (_) {}
      });
    };

    // capture: true — критично для iOS, чтобы успеть до WKWebView
    el.addEventListener('paste', handler as any, true);
    return () => el.removeEventListener('paste', handler as any, true);
  }, []);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onSubmit && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <textarea
      ref={innerRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKey}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      autoFocus={autoFocus}
      rows={1}
      style={{
        width: '100%',
        background: 'transparent',
        color: 'var(--text-primary)',
        fontSize: 15,
        lineHeight: '20px',
        padding: '10px 14px',
        border: 0,
        outline: 0,
        resize: 'none',
        maxHeight,
        overflowY: 'auto',
        ...style,
      }}
    />
  );
});
