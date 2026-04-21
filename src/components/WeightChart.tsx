import type { WeightChartPoint } from '../types'

interface WeightChartProps {
  points: WeightChartPoint[]
  weightUnit: 'lb' | 'kg'
}

const VIEW_BOX_WIDTH = 320
const VIEW_BOX_HEIGHT = 180
const PADDING = {
  top: 16,
  right: 12,
  bottom: 34,
  left: 38,
}

function buildScale(points: WeightChartPoint[]) {
  const values = points.flatMap((point) => [point.weight, point.trend]).filter((value): value is number => value !== null)
  if (!values.length) {
    return { min: 0, max: 1 }
  }

  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const spread = Math.max(rawMax - rawMin, 1)
  const min = rawMin - spread * 0.15
  const max = rawMax + spread * 0.15
  return { min, max }
}

function projectPoint(
  point: WeightChartPoint,
  index: number,
  total: number,
  value: number,
  scale: { min: number; max: number },
) {
  const plotWidth = VIEW_BOX_WIDTH - PADDING.left - PADDING.right
  const plotHeight = VIEW_BOX_HEIGHT - PADDING.top - PADDING.bottom
  const x = PADDING.left + (total <= 1 ? plotWidth : (index / (total - 1)) * plotWidth)
  const y = PADDING.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight
  return { ...point, x, y, value }
}

function buildSegments(
  points: WeightChartPoint[],
  selector: (point: WeightChartPoint) => number | null,
  scale: { min: number; max: number },
) {
  const segments: Array<Array<ReturnType<typeof projectPoint>>> = []
  let currentSegment: Array<ReturnType<typeof projectPoint>> = []

  points.forEach((point, index) => {
    const value = selector(point)
    if (value === null) {
      if (currentSegment.length) {
        segments.push(currentSegment)
        currentSegment = []
      }
      return
    }

    currentSegment.push(projectPoint(point, index, points.length, value, scale))
  })

  if (currentSegment.length) {
    segments.push(currentSegment)
  }

  return segments
}

function buildPolyline(points: Array<ReturnType<typeof projectPoint>>): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function WeightChart({ points, weightUnit }: WeightChartProps) {
  if (!points.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-8 text-center text-sm text-slate-600 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-slate-300">
        Add a few weigh-ins to see your progress line and 7-day average.
      </div>
    )
  }

  if (points.length < 2) {
    return (
      <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-8 text-center text-sm text-slate-600 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-slate-300">
        Add one more weigh-in to unlock the chart view. Your latest entry is already saved.
      </div>
    )
  }

  const scale = buildScale(points)
  const weightSegments = buildSegments(points, (point) => point.weight, scale)
  const trendSegments = buildSegments(points, (point) => point.trend, scale)
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = scale.min + ((scale.max - scale.min) * index) / 3
    const y = PADDING.top + ((scale.max - value) / (scale.max - scale.min)) * (VIEW_BOX_HEIGHT - PADDING.top - PADDING.bottom)
    return { value, y }
  })
  const labelIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1]
  const xLabels = [...new Set(labelIndexes)].map((index) => {
    const point = projectPoint(points[index], index, points.length, points[index].weight ?? points[index].trend ?? scale.min, scale)
    return { label: point.label, x: point.x }
  })

  return (
    <div className="h-72 w-full min-w-0 rounded-[24px] border border-black/5 bg-white/70 p-2 dark:border-white/10 dark:bg-slate-950/30">
      <svg
        aria-label={`Weight trend chart in ${weightUnit}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      >
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              stroke="rgba(148, 163, 184, 0.28)"
              strokeDasharray="4 4"
              x1={PADDING.left}
              x2={VIEW_BOX_WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
            />
            <text
              className="fill-slate-500 text-[9px] dark:fill-slate-400"
              dominantBaseline="middle"
              textAnchor="end"
              x={PADDING.left - 6}
              y={tick.y}
            >
              {Math.round(tick.value)}
            </text>
          </g>
        ))}

        {xLabels.map((label) => (
          <text
            className="fill-slate-500 text-[9px] dark:fill-slate-400"
            key={`${label.label}-${label.x}`}
            textAnchor="middle"
            x={label.x}
            y={VIEW_BOX_HEIGHT - 10}
          >
            {label.label}
          </text>
        ))}

        {trendSegments.map((segment, index) => (
          <polyline
            fill="none"
            key={`trend-${index}`}
            points={buildPolyline(segment)}
            stroke="#f59e0b"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ))}

        {weightSegments.map((segment, index) => (
          <polyline
            fill="none"
            key={`weight-${index}`}
            points={buildPolyline(segment)}
            stroke="#0f766e"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ))}

        {weightSegments.flat().map((point) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill="#0f766e"
            key={`${point.date}-${point.value}`}
            r="2.8"
          >
            <title>{`${point.label}: ${point.value} ${weightUnit}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}
