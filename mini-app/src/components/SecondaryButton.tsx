// Вторичная кнопка — outline, без градиента. Тише визуально.
import type { ReactNode } from 'react';
import { impactHaptic } from '../utils/haptics';

interface Props {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  style?: React.CSSProperties;
}

export function SecondaryButton({ children, onClick, disabled, full, style }: Props) {
  return (
    <button
      onClick={() => { if (!disabled) { impactHaptic('light'); onClick?.(); } }}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '13px 20px',
        borderRadius: 12,
        minHeight: 48,
        width: full ? '100%' : undefined,
        color: 'var(--text-primary)',
        fontSize: 16,
        fontWeight: 500,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
