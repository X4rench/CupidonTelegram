// ═══════════════════════════════════════════════════════════════
// DifficultySlider — кастомный слайдер сложности 1..10.
//
// Дизайн (порт RN/CustomSlider.js → DOM):
//   - Track 6px, скруглённый, фон var(--bg-elevated).
//   - Заполненная часть слева — градиент var(--gradient-accent).
//   - Thumb 24×24, белый с цветным центром, тень.
//   - Под слайдером — значение "Сложность: N/10" слева и метка
//     характеристики справа ("Заинтересована"/"Холодна"/"Неприступна").
//   - Pointer events: down/move/up на всём контейнере (тапнул в любое
//     место трека → ползунок прыгает туда). Haptic selection каждый шаг.
//
// API:
//   <DifficultySlider value={3} onChange={n => ...} min={1} max={10} />
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { selectionHaptic } from '../utils/haptics';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

const TRACK_HEIGHT = 6;
const THUMB_SIZE   = 24;

export function DifficultySlider({ value, onChange, min = 1, max = 10 }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastValRef = useRef(value);
  const draggingRef = useRef(false);

  // Округление до int в диапазоне [min..max].
  const clampVal = useCallback((v: number) => {
    const r = Math.round(v);
    return Math.max(min, Math.min(max, r));
  }, [min, max]);

  // Из позиции X на треке → дискретное значение.
  const positionToValue = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    const raw = min + ratio * (max - min);
    return clampVal(raw);
  }, [min, max, value, clampVal]);

  const setVal = useCallback((next: number) => {
    if (next === lastValRef.current) return;
    lastValRef.current = next;
    selectionHaptic();
    onChange(next);
  }, [onChange]);

  // Sync external value
  useEffect(() => {
    lastValRef.current = value;
  }, [value]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    draggingRef.current = true;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    setVal(positionToValue(e.clientX));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setVal(positionToValue(e.clientX));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { trackRef.current?.releasePointerCapture(e.pointerId); } catch (_) {}
    setVal(positionToValue(e.clientX));
  };

  const fillPct = ((value - min) / (max - min)) * 100;

  const label =
    value <= 3 ? 'Заинтересована'
    : value <= 6 ? 'Холодна'
    : value <= 8 ? 'Неприступна'
    : 'Айс';

  const labelColor =
    value <= 3 ? 'var(--status-positive)'
    : value <= 6 ? 'var(--status-warning)'
    : 'var(--status-negative)';

  return (
    <div style={styles.wrap}>
      {/* Touch target — увеличенная зона захвата (24+16 vertical padding) */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label="Сложность"
        style={styles.touchArea}
      >
        {/* Track background */}
        <div style={styles.track}>
          <div style={{ ...styles.trackFill, width: `${fillPct}%` }} />
        </div>
        {/* Thumb */}
        <div
          style={{
            ...styles.thumb,
            left: `calc(${fillPct}% - ${THUMB_SIZE / 2}px)`,
          }}
        >
          <div style={styles.thumbInner} />
        </div>
      </div>

      <div style={styles.labels}>
        <span style={styles.valueLabel}>Сложность: <strong style={{ color: 'var(--text-primary)' }}>{value}/{max}</strong></span>
        <span style={{ ...styles.statusLabel, color: labelColor }}>{label}</span>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    width: '100%',
  },
  touchArea: {
    position: 'relative',
    width: '100%',
    height: THUMB_SIZE + 16,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    touchAction: 'none', // disable browser pan — мы сами обрабатываем
    userSelect: 'none',
  },
  track: {
    position: 'absolute',
    left: 0, right: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    background: 'var(--bg-elevated)',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    background: 'var(--gradient-accent)',
    borderRadius: TRACK_HEIGHT / 2,
    transition: 'width 80ms linear',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35), 0 0 0 3px rgba(255,255,255,0.0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'left 80ms linear',
  },
  thumbInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    background: 'var(--accent-primary)',
  },
  labels: {
    marginTop: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
  },
  valueLabel: {
    color: 'var(--text-secondary)',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: 600,
  },
};
