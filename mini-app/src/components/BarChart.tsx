// ═══════════════════════════════════════════════════════════════
// BarChart — простой inline SVG bar chart без библиотек.
// Используется в кабинете партнёра, в детальной карточке партнёра
// в админке, и в AdminChartScreen для метрик.
//
// Реализация:
//   - SVG только рисует ПРЯМОУГОЛЬНИКИ (bars). Растягивается через
//     preserveAspectRatio="none" — высота столбиков сохраняется (height
//     прибит к input prop), ширина адаптивная.
//   - Подписи labels рендерятся ОТДЕЛЬНО через HTML-flex под SVG.
//     Это критично: внутри SVG с preserveAspectRatio="none" текст
//     масштабируется неравномерно (X отдельно от Y) и при большом
//     количестве баров (например 12 месяцев на 144px viewBox при 350px
//     контейнере) подписи слипаются в нечитаемую кашу. HTML-flex решает
//     это полностью — подписи равномерно распределены и шрифт не
//     зависит от ширины контейнера.
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
  const totalWidth = data.length * barStep;
  const hasLabels = labels && labels.length > 0;

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
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
            <rect
              key={i}
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
          );
        })}
      </svg>

      {/* HTML labels — равномерно распределены под SVG. Шрифт не зависит
          от ширины контейнера. Скрываем пустые подписи через CSS чтобы
          сохранить позиционирование других. */}
      {hasLabels && (
        <div style={labelsRowStyle(data.length)}>
          {labels!.map((lab, i) => (
            <div
              key={`l${i}`}
              style={{
                ...labelCellStyle,
                visibility: lab ? 'visible' : 'hidden',
              }}
            >
              {lab}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelCellStyle: CSSProperties = {
  flex: '1 1 0',
  textAlign: 'center',
  fontSize: 10,
  lineHeight: '14px',
  color: 'var(--text-muted)',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'clip',
  minWidth: 0,
};

function labelsRowStyle(count: number): CSSProperties {
  // Если меток мало (≤ 12) — равномерно распределяем по flex.
  // Если много (30+) — те у которых текст пустой просто пропадают
  // через visibility, и видимые равномерно разнесены через flex.
  return {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6,
    // Уменьшаем шрифт ещё сильнее если меток много (30 дней)
    fontSize: count > 14 ? 9 : 10,
  };
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
