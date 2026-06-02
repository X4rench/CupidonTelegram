// Тег/чип — небольшая metka. Активная — accent-фон.
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export function Chip({ children, active, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 32,
        padding: '0 12px',
        borderRadius: 16,
        fontSize: 13,
        fontWeight: 500,
        color: active ? '#fff' : 'var(--text-secondary)',
        background: active ? 'var(--accent-primary)' : 'var(--bg-elevated)',
        border: '1px solid',
        borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
