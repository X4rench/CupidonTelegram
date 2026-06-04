// ═══════════════════════════════════════════════════════════════
// AutoGrowTextarea — textarea, который сам растёт по высоте контента
// (паттерн §6.5 в TMA_PORTING_PLAYBOOK).
//
// Про multi-line paste на iOS:
// Apple WKWebView физически блокирует multi-line clipboard для cross-app
// paste — независимо от типа DOM элемента (textarea/input/contenteditable).
// readTextFromClipboard из TG WebApp API возвращает null на mobile
// (см. github.com/Telegram-Mini-Apps/telegram-apps/issues/609).
// Это НЕ исправляется ни JS-хаками, ни DOM-обвязкой. Решение — на уровне
// UX: подсказка пользователю с альтернативным способом (через чат с ботом
// или с десктопа).
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
      // Отключаем системные «помощники» — на iOS не должны влиять, но
      // на всякий случай чистим поведение.
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
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

/**
 * Helper: запущено ли Mini App на iOS Telegram. Используется для показа
 * iOS-специфичных подсказок (типа «вставка ограничена системой»).
 */
export function isTelegramIOS(): boolean {
  const tg: any = (window as any)?.Telegram?.WebApp;
  return tg?.platform === 'ios';
}
