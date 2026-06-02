// Page layout с учётом safe-area сверху и места для нижнего таб-бара.
import type { ReactNode, CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  withTabBar?: boolean;  // если true — оставляет паддинг внизу под таб-бар
  scroll?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Layout({ children, withTabBar = false, scroll = true, style, className }: Props) {
  return (
    <div
      className={className}
      style={{
        minHeight: '100vh',
        paddingTop: 'var(--safe-top)',
        paddingBottom: withTabBar
          ? `calc(64px + var(--safe-bottom) + 8px)`
          : `calc(var(--safe-bottom) + 16px)`,
        overflowY: scroll ? 'auto' : 'hidden',
        background: 'var(--bg-primary)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
