// ═══════════════════════════════════════════════════════════════
// AutoGrowTextarea — textarea, который сам растёт по высоте контента
// (паттерн §6.5 в TMA_PORTING_PLAYBOOK).
// Использует ref-измерение scrollHeight: сначала сбрасываем height до
// 'auto', затем выставляем = scrollHeight; max-height ограничивает рост.
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
