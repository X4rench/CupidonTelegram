// Карточка-контейнер с подложкой и border.
import type { ReactNode, CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  accent?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}

export function Card({ children, accent, onClick, style, className }: Props) {
  const baseStyle: CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid',
    borderColor: accent ? 'var(--border-accent)' : 'var(--border-subtle)',
    borderRadius: 16,
    padding: 16,
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  };

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={className}
        style={{ ...baseStyle, textAlign: 'left', width: '100%' }}
      >
        {children}
      </button>
    );
  }
  return <div className={className} style={baseStyle}>{children}</div>;
}
