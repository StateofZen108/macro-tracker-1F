import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WeightChartPoint } from '../types'

interface WeightChartProps {
  points: WeightChartPoint[]
  weightUnit: 'lb' | 'kg'
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

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.28)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            domain={['dataMin - 2', 'dataMax + 2']}
            tickFormatter={(value) => `${Math.round(value)}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              backgroundColor: 'rgba(15, 23, 42, 0.96)',
              color: '#f8fafc',
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null
              }

              return (
                <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 text-sm text-slate-100 shadow-xl">
                  {payload.map((item) => (
                    <div key={item.dataKey?.toString()} className="flex items-center justify-between gap-3">
                      <span className="text-slate-300">
                        {item.name === 'weight' ? 'Weight' : '7-day avg'}
                      </span>
                      <span className="font-semibold text-white">
                        {item.value ?? '-'} {weightUnit}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            name="weight"
            stroke="#0f766e"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="trend"
            name="trend"
            stroke="#f59e0b"
            strokeWidth={3}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
