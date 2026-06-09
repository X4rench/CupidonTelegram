// ═══════════════════════════════════════════════════════════════
// DialogActionsMenu — кнопка «⋮» + меню действий для строки диалога.
//
// Используется в AllDialogsScreen, SimulatorScreen «Незавершённые»,
// HomeScreen «Активные диалоги». Сейчас одно действие — «Удалить»,
// но компонент расширяемый (можно добавить «Закрепить», «Архив» и т.п.).
//
// Антипаттерны которые я обхожу:
//   - menu прибит к viewport (position:fixed) — не закрывается scroll'ом
//   - тап на кнопку не должен трогать parent click (stopPropagation)
//   - confirm — обычный window.confirm, не модалка (быстро, понятно)
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState, type CSSProperties } from 'react';
import { selectionHaptic, impactHaptic } from '../utils/haptics';

interface Props {
  /** Текст для confirm: «Удалить «Аня»?». null → без confirm. */
  confirmText?: string;
  /** Что делать при подтверждении. async — пока висит, кнопка disabled. */
  onDelete: () => void | Promise<void>;
  /** Иконка-тригер тёмная? (для светлого фона на градиентной карточке). */
  light?: boolean;
}

export function DialogActionsMenu({ confirmText, onDelete, light }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Закрытие меню при клике по фону
  useEffect(() => {
    if (!open) return;
    const onAnywhere = () => setOpen(false);
    // setTimeout — чтобы текущий клик «открытия» не закрыл сразу же
    const t = setTimeout(() => document.addEventListener('click', onAnywhere), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onAnywhere);
    };
  }, [open]);

  const onDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setOpen(false);
    if (confirmText && !window.confirm(confirmText)) return;
    impactHaptic('medium');
    setBusy(true);
    try { await onDelete(); } catch (_) {}
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          selectionHaptic();
          setOpen(v => !v);
        }}
        disabled={busy}
        style={{
          ...styles.dotsBtn,
          color: light ? '#fff' : 'var(--text-muted)',
          opacity: busy ? 0.4 : 1,
        }}
        aria-label="Действия"
      >
        {busy ? (
          // Простой ⏳ когда удаление в процессе
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2}
               style={{ animation: 'spin 0.9s linear infinite', transformOrigin: 'center' }}>
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        ) : (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
            <circle cx={5}  cy={12} r={1.6} />
            <circle cx={12} cy={12} r={1.6} />
            <circle cx={19} cy={12} r={1.6} />
          </svg>
        )}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {open && (
        <div style={styles.menu}>
          <button
            type="button"
            onClick={onDeleteClick}
            style={styles.menuItem}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                 stroke="var(--status-negative)" strokeWidth={2}
                 strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <line x1={10} y1={11} x2={10} y2={17} />
              <line x1={14} y1={11} x2={14} y2={17} />
            </svg>
            <span style={{ color: 'var(--status-negative)' }}>Удалить</span>
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  dotsBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: 'transparent', border: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    transition: 'opacity 160ms',
  },
  menu: {
    position: 'absolute',
    top: 36, right: 0,
    minWidth: 140,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    padding: 4,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 30,
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: 0,
    borderRadius: 6,
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
  },
};
