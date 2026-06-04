// ═══════════════════════════════════════════════════════════════
// AutoGrowTextarea — мульти-строчное поле ввода, авторастущее по контенту.
//
// Под капотом — <div contenteditable="true">, НЕ <textarea>.
//
// Почему так:
// На iOS Telegram WebView у <textarea> две архитектурные проблемы:
//   1. Long-press → Paste из чата TG обрезает multi-line до первой строки.
//      Это политика Apple (см. github.com/Telegram-Mini-Apps/telegram-apps/
//      issues/609 — "clipboard_text_received data always return null on iOS").
//   2. readTextFromClipboard работает только для Mini App'ов запущенных
//      через attachment menu (скрепка в чате), а Купидон запускается
//      через direct link — поэтому метод возвращает null.
// В <div contenteditable> paste работает НАТИВНО с multi-line на всех
// платформах включая iOS. Apple/WebKit обрабатывают paste в editable HTML
// по-другому — там нет ограничений на newlines.
//
// API совместим со старым textarea — value/onChange как было, plus новые:
//   - pasteButton — оставлен для fallback (на iOS contenteditable должен
//     работать, но кнопка пусть тоже есть для надёжности)
//
// Внутри:
//   - При paste конвертируем clipboard HTML → plain text (newlines в \n)
//   - innerText используется как «текущее значение» (не innerHTML)
//   - Auto-grow через CSS min-height + естественный рост div'а
// ═══════════════════════════════════════════════════════════════
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { readClipboard, isClipboardReadSupported, clipboardErrorMessage } from '../utils/clipboard';
import { notificationHaptic, selectionHaptic } from '../utils/haptics';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  maxLength?: number;
  maxHeight?: number;
  disabled?: boolean;
  style?: CSSProperties;
  autoFocus?: boolean;
  /** Кнопка «Вставить» через TG WebApp API. Fallback если ничего не помогает. */
  pasteButton?: boolean;
  pasteButtonLabel?: string;
}

export interface AutoGrowTextareaHandle {
  focus: () => void;
}

/** HTML → plain text с сохранением переносов строк. */
function htmlToPlain(html: string): string {
  // Используем DOMParser — он на iOS отлично работает.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Заменяем блочные элементы на \n перед извлечением textContent
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach(el => {
    el.append('\n');
  });
  const text = doc.body.textContent || '';
  // Нормализация: \r\n → \n, схлопывание тройных переносов
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

export const AutoGrowTextarea = forwardRef<AutoGrowTextareaHandle, Props>(function AutoGrowTextarea(
  {
    value, onChange, onSubmit, placeholder, maxLength,
    maxHeight = 120, disabled, style, autoFocus,
    pasteButton, pasteButtonLabel,
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  // Сохраняем последнее value которое мы установили в DOM, чтобы избежать
  // ненужных перерисовок (которые сбрасывают курсор).
  const lastSetValueRef = useRef<string>('');
  const onChangeRef = useRef(onChange);
  const maxLenRef   = useRef(maxLength);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { maxLenRef.current = maxLength; }, [maxLength]);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
  }));

  // Синхронизация value → DOM. Только если значение отличается (иначе
  // курсор будет прыгать при каждом ререндере).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (lastSetValueRef.current !== value) {
      // innerText сохраняет переносы строк как \n. Безопасно — никакой HTML.
      el.innerText = value;
      lastSetValueRef.current = value;
    }
  }, [value]);

  // Auto-resize: расширяем сразу после изменения value.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  // Авто-сброс ошибки кнопки через 3с
  useEffect(() => {
    if (!pasteError) return;
    const t = setTimeout(() => setPasteError(null), 3000);
    return () => clearTimeout(t);
  }, [pasteError]);

  // Чтение текущего текста — единая точка истины.
  const readCurrent = (): string => {
    const el = editorRef.current;
    if (!el) return '';
    // innerText даёт plain text с \n из <br>. Идеально для нашего случая.
    return el.innerText.replace(/\r\n/g, '\n');
  };

  const fireChange = (next: string) => {
    let v = next;
    const ml = maxLenRef.current;
    if (typeof ml === 'number' && v.length > ml) v = v.slice(0, ml);
    lastSetValueRef.current = v;
    onChangeRef.current(v);
  };

  const onInput = () => {
    fireChange(readCurrent());
  };

  // Paste — нативно даём WebView вставить, а потом нормализуем результат.
  // На iOS contenteditable paste из TG чата приходит ПОЛНЫМ multi-line.
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const cd = e.clipboardData;
    if (!cd) return; // дефолт сделает своё
    const html  = cd.getData('text/html');
    const plain = cd.getData('text/plain') || cd.getData('text') || '';

    // Если есть html с переносами — используем его (лучше всего сохраняет
    // структуру). Иначе plain — он на contenteditable обычно полный.
    let text: string;
    if (html && (html.includes('<br') || html.includes('<p') || html.includes('<div'))) {
      text = htmlToPlain(html);
    } else if (plain) {
      text = plain;
    } else {
      // Нет ни plain, ни html — даём дефолт
      return;
    }

    e.preventDefault();
    // Вставляем как plain через execCommand insertText — это записывает
    // в contenteditable БЕЗ форматирования (просто текст с \n как <br>).
    // execCommand deprecated, но на iOS WebView — единственный надёжный
    // способ вставить текст в текущее selection с сохранением курсора.
    try {
      document.execCommand('insertText', false, text);
    } catch (_) {
      // Fallback: ручная вставка через Selection API
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
        }
      } catch (_) { /* совсем плохо — оставляем как есть */ }
    }
    // Триггерим onChange после вставки
    requestAnimationFrame(() => onInput());
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onSubmit && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Кнопка «Вставить» — fallback через TG WebApp API
  const showPasteButton = !!pasteButton && isClipboardReadSupported();

  const handlePasteButton = async () => {
    if (pasteBusy || disabled) return;
    selectionHaptic();
    setPasteBusy(true);
    setPasteError(null);
    try {
      const result = await readClipboard();
      console.log('[clipboard]', result);
      if (!result.text) {
        setPasteError(clipboardErrorMessage(result.reason));
        notificationHaptic('error');
        return;
      }
      const next = (value || '') + (value ? '\n' : '') + result.text;
      fireChange(next);
      // Обновим DOM сразу (без ожидания эффекта)
      const el = editorRef.current;
      if (el) {
        el.innerText = next;
        lastSetValueRef.current = next;
      }
      notificationHaptic('success');
    } catch (e: any) {
      console.error('[clipboard] exception', e);
      setPasteError(e?.message || 'Не удалось прочитать буфер');
      notificationHaptic('error');
    } finally {
      setPasteBusy(false);
    }
  };

  // Auto-focus
  useEffect(() => {
    if (autoFocus) {
      editorRef.current?.focus();
    }
  }, [autoFocus]);

  // ── Render ──────────────────────────────────────────────────────────
  const showPlaceholder = !value;

  const editorStyle: CSSProperties = {
    width: '100%',
    minHeight: 20,
    maxHeight,
    overflowY: 'auto',
    color: 'var(--text-primary)',
    fontSize: 15,
    lineHeight: '20px',
    padding: '10px 14px',
    background: 'transparent',
    border: 0,
    outline: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    WebkitUserSelect: 'text',
    userSelect: 'text',
    // На iOS курсор иногда уходит в 0,0 без явного caret-color
    caretColor: 'var(--text-accent)',
    ...style,
  };

  const placeholderStyle: CSSProperties = {
    position: 'absolute',
    top: editorStyle.padding ? '10px' : 0,
    left: editorStyle.padding ? '14px' : 0,
    color: 'var(--text-muted)',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    fontSize: editorStyle.fontSize,
    lineHeight: editorStyle.lineHeight,
  };

  const editor = (
    <div style={{ position: 'relative', width: '100%' }}>
      {showPlaceholder && placeholder && (
        <div style={placeholderStyle}>{placeholder}</div>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={onInput}
        onPaste={onPaste}
        onKeyDown={onKey}
        spellCheck={false}
        style={editorStyle}
      />
    </div>
  );

  if (!showPasteButton) return editor;

  return (
    <div style={{ width: '100%' }}>
      <div style={pasteRowStyle}>
        <button
          type="button"
          onClick={handlePasteButton}
          disabled={pasteBusy || disabled}
          style={{
            ...pasteBtnStyle,
            opacity: pasteBusy || disabled ? 0.55 : 1,
            cursor: pasteBusy || disabled ? 'default' : 'pointer',
          }}
          aria-label="Вставить из буфера"
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x={9} y={2} width={6} height={4} rx={1} />
            <path d="M9 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-3" />
          </svg>
          <span>{pasteBusy ? 'Вставляю…' : (pasteButtonLabel || 'Вставить')}</span>
        </button>
        {pasteError && <span style={pasteErrorStyle}>{pasteError}</span>}
      </div>
      {editor}
    </div>
  );
});

const pasteRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  justifyContent: 'flex-end',
  padding: '0 4px 6px',
};

const pasteBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-accent)',
  background: 'var(--accent-soft)',
  border: '1px solid var(--border-accent)',
  transition: 'opacity 160ms, transform 80ms',
};

const pasteErrorStyle: CSSProperties = {
  marginRight: 'auto',
  fontSize: 11,
  color: 'var(--status-negative)',
};
