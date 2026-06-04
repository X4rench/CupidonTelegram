// ═══════════════════════════════════════════════════════════════
// DonutChart — простой inline SVG donut.
// Принимает массив сегментов { label, value, color }.
// Если все значения = 0 → отрисовываем серый круг + надпись «Нет данных».
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties } from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  /** Толщина кольца, default = size/5 */
  thickness?: number;
  /** Подпись в центре. Если не задан — показывает сумму значений. */
  centerLabel?: string;
  /** Подзаголовок в центре под centerLabel. */
  centerSub?: string;
  /** Скрыть легенду (отдельный блок снизу). */
  hideLegend?: boolean;
}

export function DonutChart({
  segments,
  size = 120,
  thickness,
  centerLabel,
  centerSub,
  hideLegend,
}: Props) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const stroke = thickness ?? Math.round(size / 5);
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // строим набор <circle> с stroke-dasharray (offset = накапливаемый процент)
  let acc = 0;
  const arcs = segments.map((seg, i) => {
    const v = Math.max(0, seg.value);
    const pct = total > 0 ? v / total : 0;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const offset = -acc * circumference;
    acc += pct;
    return { seg, dash, gap, offset, i };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Donut chart"
        >
          {/* Фоновое кольцо */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth={stroke}
          />
          {total > 0 && arcs.map(({ seg, dash, gap, offset, i }) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            >
              <title>{`${seg.label}: ${seg.value}`}</title>
            </circle>
          ))}
        </svg>
        {(centerLabel || centerSub) && (
          <div style={centerStyle}>
            {centerLabel && <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{centerLabel}</span>}
            {centerSub && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{centerSub}</span>}
          </div>
        )}
      </div>

      {!hideLegend && segments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          {segments.map((s, i) => (
            <div key={i} style={legendRowStyle}>
              <span style={{ ...dotStyle, background: s.color }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const centerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  textAlign: 'center',
};

const legendRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const dotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 5,
  flexShrink: 0,
};
