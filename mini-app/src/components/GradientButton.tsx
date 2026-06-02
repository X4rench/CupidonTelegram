// Основная CTA-кнопка с градиентом + haptic при нажатии.
import type { ReactNode } from 'react';
import { impactHaptic } from '../utils/haptics';

interface Props {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  icon?: ReactNode;
  style?: React.CSSProperties;
}

export function GradientButton({ children, onClick, disabled, loading, full, icon, style }: Props) {
  const handleClick = () => {
    if (disabled || loading) return;
    impactHaptic('light');
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 20px',
        borderRadius: 12,
        minHeight: 48,
        width: full ? '100%' : undefined,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        background: 'var(--gradient-accent)',
        opacity: disabled || loading ? 0.5 : 1,
        transition: 'transform 80ms ease-out, opacity 120ms ease-out',
        ...style,
      }}
      onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
      onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {loading ? <DotsLoader /> : (
        <>
          {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}

function DotsLoader() {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', height: 20 }}>
      <span className="dot" style={{ animationDelay: '0s' }} />
      <span className="dot" style={{ animationDelay: '0.2s' }} />
      <span className="dot" style={{ animationDelay: '0.4s' }} />
      <style>{`
        .dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #fff; opacity: 0.5;
          animation: dotsPulse 0.84s ease-in-out infinite;
        }
        @keyframes dotsPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.75); }
          50%      { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}
