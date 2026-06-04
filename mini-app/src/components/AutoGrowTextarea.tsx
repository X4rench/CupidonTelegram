// ═══════════════════════════════════════════════════════════════
// AutoGrowTextarea — textarea, который сам растёт по высоте контента
// (паттерн §6.5 в TMA_PORTING_PLAYBOOK).
// Использует ref-измерение scrollHeight: сначала сбрасываем height до
// 'auto', затем выставляем = scrollHeight; max-height ограничивает рост.
//
// iOS-фикс: явный onPaste handler. На iOS Telegram WebView (WKWebView)
// многострочная вставка обрезается до первой строки — браузер игнорирует
// \n в clipboardData при дефолтной обработке для textarea с rows=1.
// Решение: перехватываем событие, читаем clipboard через
// e.clipboardData.getData('text/plain'), и вставляем через setRangeText
// (или ручную сборку newValue). Работает идентично и на Android, и в desktop.
// ═══════════════════════════════════════════════════════════════
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ClipboardEvent,
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

export const AutoGrowTextarea = forwardRef<AutoGrowTextareaHandle, Props>(function AutoGrowTextarea(
  { value, onChange, onSubmit, placeholder, maxLength, maxHeight = 120, disabled, style, autoFocus },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => innerRef.current?.focus(),
  }));

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onSubmit && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // iOS Telegram WebView обрезает multi-line paste до первой строки —
  // фиксим явной вставкой через setRangeText / ручную сборку.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const text = cd.getData('text/plain') ?? cd.getData('text') ?? '';
    if (!text) return;
    // Не нормализуем CRLF — оставляем как есть; \r игнорится textarea.
    // Делаем явную замену только если в буфере есть переносы строк, либо
    // если выделение — чтобы не ломать дефолтное поведение для коротких вставок.
    const el = e.currentTarget;
    if (!text.includes('\n') && !text.includes('\r') &&
        el.selectionStart === el.selectionEnd) {
      // Однострочная вставка без выделения — пусть браузер делает сам
      // (включая ввод через автозамену / диктовку iOS).
      return;
    }
    e.preventDefault();
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? start;
    const before = el.value.slice(0, start);
    const after  = el.value.slice(end);
    const next   = before + text + after;
    // Уважаем maxLength (если задан) — обрезаем «лишний» хвост вставки.
    const limited = typeof maxLength === 'number' && next.length > maxLength
      ? next.slice(0, maxLength)
      : next;
    onChange(limited);
    // Курсор — после вставленного фрагмента
    requestAnimationFrame(() => {
      const pos = Math.min(start + text.length, limited.length);
      try { el.selectionStart = el.selectionEnd = pos; } catch (_) {}
    });
  };

  return (
    <textarea
      ref={innerRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKey}
      onPaste={onPaste}
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
