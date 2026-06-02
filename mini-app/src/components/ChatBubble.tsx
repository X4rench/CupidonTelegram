// ═══════════════════════════════════════════════════════════════
// ChatBubble — пузырь сообщения в чате (me — справа, градиент;
// her — слева, серый bg). Поддерживает индикатор "печатает..." (typing).
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties, ReactNode } from 'react';

export interface ChatBubbleProps {
  from: 'me' | 'her';
  children?: ReactNode;
  typing?: boolean;
}

export function ChatBubble({ from, children, typing }: ChatBubbleProps) {
  if (from === 'me') {
    return (
      <div style={styles.bubbleMeWrap}>
        <div style={styles.bubbleMe}>{children}</div>
      </div>
    );
  }
  return (
    <div style={styles.bubbleHerWrap}>
      <div style={styles.bubbleHer}>{typing ? <TypingDots /> : children}</div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', height: 18 }}>
      <span className="typingDot" style={{ animationDelay: '0s' }} />
      <span className="typingDot" style={{ animationDelay: '0.18s' }} />
      <span className="typingDot" style={{ animationDelay: '0.36s' }} />
      <style>{`
        .typingDot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--text-muted);
          opacity: 0.5;
          animation: typingPulse 0.84s ease-in-out infinite;
        }
        @keyframes typingPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.7); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  bubbleHerWrap: { display: 'flex', justifyContent: 'flex-start' },
  bubbleHer: {
    maxWidth: '90%',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: '21px',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  bubbleMeWrap: { display: 'flex', justifyContent: 'flex-end' },
  bubbleMe: {
    maxWidth: '85%',
    background: 'var(--gradient-accent)',
    color: '#fff',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: '21px',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
};
