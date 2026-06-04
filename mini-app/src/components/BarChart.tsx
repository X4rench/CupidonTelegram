// ═══════════════════════════════════════════════════════════════
// BarChart — простой inline SVG bar chart без библиотек.
// Используется в кабинете партнёра и в детальной карточке партнёра в админке.
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties } from 'react';

interface Props {
  data: number[];
  labels?: string[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function BarChart({
  data,
  labels,
  height = 80,
  color = 'var(--accent-primary)',
  formatValue,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={emptyStyle(height)}>
        Нет данных
      </div>
    );
  }

  const max = Math.max(...data, 1); // защита от деления на 0
  const barStep = 12;
  const barWidth = 8;
  const barInset = 2;
  const labelGap = labels && labels.length > 0 ? 20 : 4;
  const totalWidth = data.length * barStep;
  const viewHeight = height + labelGap;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${viewHeight}`}
      preserveAspectRatio="none"
      width="100%"
      height={viewHeight}
      style={{ display: 'block' }}
      role="img"
      aria-label="Bar chart"
    >
      {data.map((v, i) => {
        const safe = Math.max(0, v);
        const barH = max > 0 ? (safe / max) * height : 0;
        const y = height - barH;
        const x = i * barStep + barInset;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              fill={color}
              rx={1}
              opacity={safe === 0 ? 0.25 : 1}
            >
              <title>{formatValue ? formatValue(v) : String(v)}</title>
            </rect>
          </g>
        );
      })}
      {labels && labels.length > 0 && labels.map((lab, i) => (
        <text
          key={`l${i}`}
          x={i * barStep + barStep / 2}
          y={height + 14}
          fontSize={9}
          textAnchor="middle"
          fill="var(--text-muted)"
        >
          {lab}
        </text>
      ))}
    </svg>
  );
}

function emptyStyle(h: number): CSSProperties {
  return {
    height: h,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    fontSize: 12,
    textAlign: 'center',
  };
}
