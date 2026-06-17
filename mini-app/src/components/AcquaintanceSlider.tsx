// ═══════════════════════════════════════════════════════════════
// AcquaintanceSlider — слайдер «сколько знаком с девушкой».
// Графика 1-в-1 с DifficultySlider (симулятор): трек 6px, заливка
// градиентом, белый thumb с цветным центром. Значение — индекс
// бакета времени (нелинейная шкала: 30 мин → ... → месяц+).
// Снизу: «Знакомы» слева, выбранный бакет (жирным) справа.
//
// API: <AcquaintanceSlider value={2} buckets={[...]} onChange={i => ...} />
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { selectionHaptic } from '../utils/haptics';

interface Props {
  value: number;
  buckets: string[];
  onChange: (v: number) => void;
}

const TRACK_HEIGHT = 6;
const THUMB_SIZE   = 24;

export function AcquaintanceSlider({ value, buckets, onChange }: Props) {
  const min = 0;
  const max = Math.max(0, buckets.length - 1);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastValRef = useRef(value);
  const draggingRef = useRef(false);

  const clampVal = useCallback((v: number) => {
    const r = Math.round(v);
    return Math.max(min, Math.min(max, r));
  }, [max]);

  const positionToValue = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    return clampVal(min + ratio * (max - min));
  }, [max, value, clampVal]);

  const setVal = useCallback((next: number) => {
    if (next === lastValRef.current) return;
    lastValRef.current = next;
    selectionHaptic();
    onChange(next);
  }, [onChange]);

  useEffect(() => { lastValRef.current = value; }, [value]);

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

  const fillPct = max === 0 ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div style={styles.wrap}>
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
        aria-label="Сколько знаком с девушкой"
        style={styles.touchArea}
      >
        <div style={styles.track}>
          <div style={{ ...styles.trackFill, width: `${fillPct}%` }} />
        </div>
        <div style={{ ...styles.thumb, left: `calc(${fillPct}% - ${THUMB_SIZE / 2}px)` }}>
          <div style={styles.thumbInner} />
        </div>
      </div>

      <div style={styles.labels}>
        <span style={styles.valueLabel}>Знакомы</span>
        <span style={styles.statusLabel}>{buckets[value] ?? ''}</span>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { width: '100%' },
  touchArea: {
    position: 'relative', width: '100%', height: THUMB_SIZE + 16,
    display: 'flex', alignItems: 'center', cursor: 'pointer',
    touchAction: 'none', userSelect: 'none',
  },
  track: {
    position: 'absolute', left: 0, right: 0, height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2, background: 'var(--bg-elevated)', overflow: 'hidden',
  },
  trackFill: {
    height: '100%', background: 'var(--gradient-accent)',
    borderRadius: TRACK_HEIGHT / 2, transition: 'width 80ms linear',
  },
  thumb: {
    position: 'absolute', width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2,
    background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'left 80ms linear',
  },
  thumbInner: { width: 10, height: 10, borderRadius: 5, background: 'var(--accent-primary)' },
  labels: {
    marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12,
  },
  valueLabel: { color: 'var(--text-secondary)' },
  statusLabel: { fontSize: 12, fontWeight: 600, color: 'var(--accent-primary)' },
};
