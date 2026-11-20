import React, { useId, useMemo } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// Single-series line/bar chart and a multi-series overlay chart built on the
// shadcn Chart component (recharts). Data: [{ x: string, y: number }].

const colorOf = (color) => color?.var ?? 'var(--primary)'
const identity = (v) => String(v)

export default function TrendChart({
  data, type = 'line', formatValue = identity, formatTick = formatValue, formatX = identity,
  ariaLabel, height = 208, color,
}) {
  const stroke = colorOf(color)
  const gradientId = `trend-fade-${useId().replace(/:/g, '')}`
  const config = useMemo(() => ({ y: { label: ariaLabel ?? 'Value', color: stroke } }), [ariaLabel, stroke])
  const n = data.length
  if (n === 0) return null
  const last = n - 1

  // Direct label on the latest value — muted text, never the series colour.
  const lastLabel = ({ x, y, width = 0, index, value }) => {
    if (index !== last || value == null) return null
    return (
      <text
        x={type === 'bar' ? x + width / 2 : x - 6} y={y - (type === 'bar' ? 5 : 9)}
        textAnchor={type === 'bar' ? 'middle' : 'end'}
        className="fill-muted-foreground text-[11px] font-medium tabular-nums"
      >
        {formatValue(value)}
      </text>
    )
  }

  const tooltip = (
    <ChartTooltip
      cursor={type === 'bar' ? { fill: 'var(--muted)', opacity: 0.5 } : undefined}
      content={(
        <ChartTooltipContent
          hideLabel={false}
          labelFormatter={(_, payload) => formatX(payload?.[0]?.payload?.x)}
          formatter={(value, _name, item) => (
            <div className="flex w-full items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: item.color ?? stroke }} />
              <span className="font-semibold tabular-nums text-foreground">{formatValue(value)}</span>
            </div>
          )}
        />
      )}
    />
  )

  const common = { data, margin: { top: 20, right: 14, bottom: 0, left: 0 } }
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="x" tickLine={false} axisLine={false} tickMargin={8}
        interval="preserveStartEnd" minTickGap={24} tickFormatter={formatX}
      />
      <YAxis
        width={46} tickLine={false} axisLine={false} tickMargin={4}
        tickCount={height <= 150 ? 3 : 4} tickFormatter={formatTick}
        domain={type === 'bar' ? [0, 'auto'] : ['auto', 'auto']}
      />
      {tooltip}
    </>
  )

  return (
    <ChartContainer
      config={config} role="img" aria-label={ariaLabel}
      className="aspect-auto w-full select-none" style={{ height }}
    >
      {type === 'bar' ? (
        <BarChart {...common}>
          {axes}
          <Bar
            dataKey="y" name="y" fill={stroke} radius={[4, 4, 0, 0]} maxBarSize={24}
            isAnimationActive={false} label={lastLabel}
          />
        </BarChart>
      ) : (
        <AreaChart {...common}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          {axes}
          <Area
            dataKey="y" name="y" type="linear" stroke={stroke} strokeWidth={2}
            fill={`url(#${gradientId})`} isAnimationActive={false}
            dot={n <= 24 ? { r: 3.5, fill: stroke, stroke: 'var(--card)', strokeWidth: 2 } : false}
            activeDot={{ r: 4.5, fill: stroke, stroke: 'var(--card)', strokeWidth: 2 }}
            label={lastLabel}
          />
        </AreaChart>
      )}
    </ChartContainer>
  )
}

/* ---------------------------------------------------------------------------
   Overlay chart

   Superimposes several metrics so you can see whether they move together.
   Units differ wildly, so each series is normalised to its OWN min..max (a
   flat series sits mid-height) and the y-axis shows no numbers; the tooltip
   shows each series' nearest real, formatted reading. Series of different
   granularity share one continuous time axis ('YYYY-MM' lands mid-month).
--------------------------------------------------------------------------- */

const toTime = (x) => (x.length === 7
  ? Date.parse(`${x}-15T00:00:00`)
  : Date.parse(`${x}T00:00:00`))

const fmtAxisDate = (t) => {
  const d = new Date(t)
  const m = d.toLocaleDateString(undefined, { month: 'short' })
  return d.getMonth() === 0 ? `${m} ${String(d.getFullYear()).slice(2)}` : m
}

const fmtTooltipDate = (t) => new Date(t).toLocaleDateString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric',
})

export function OverlayChart({ series, height = 240, ariaLabel }) {
  const model = useMemo(() => {
    const list = series
      .map((s) => ({
        ...s,
        pts: s.points.map((p) => ({ t: toTime(p.x), y: p.y })).sort((a, b) => a.t - b.t),
      }))
      .filter((s) => s.pts.length > 0)
    if (list.length === 0) return null

    const rows = new Map()
    for (const s of list) {
      const ys = s.pts.map((p) => p.y)
      const lo = Math.min(...ys)
      const hi = Math.max(...ys)
      for (const p of s.pts) {
        const row = rows.get(p.t) ?? { t: p.t }
        row[s.key] = hi === lo ? 0.5 : (p.y - lo) / (hi - lo)
        rows.set(p.t, row)
      }
    }
    const data = [...rows.values()].sort((a, b) => a.t - b.t)
    const config = Object.fromEntries(list.map((s) => [s.key, { label: s.label, color: colorOf(s.color) }]))
    return { list, data, config }
  }, [series])

  if (!model) return null
  const { list, data, config } = model

  // Nearest real reading per series to the hovered time.
  const renderTooltip = (props) => {
    const { active, label } = props
    if (!active || label == null) return null
    const payload = list.map((s) => {
      let best = s.pts[0]
      for (const p of s.pts) if (Math.abs(p.t - label) < Math.abs(best.t - label)) best = p
      return {
        name: s.key, dataKey: s.key, color: colorOf(s.color), payload: {},
        value: s.formatValue ? s.formatValue(best.y) : String(best.y),
      }
    })
    return (
      <ChartTooltipContent
        active payload={payload} label={label}
        labelFormatter={() => fmtTooltipDate(label)}
      />
    )
  }

  return (
    <ChartContainer
      config={config} role="img" aria-label={ariaLabel}
      className="aspect-auto w-full select-none" style={{ height }}
    >
      <LineChart data={data} margin={{ top: 16, right: 14, bottom: 0, left: 14 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
          tickLine={false} axisLine={false} tickMargin={8} tickCount={5}
          tickFormatter={fmtAxisDate}
        />
        <YAxis yAxisId="rel" hide domain={[0, 1]} />
        <ChartTooltip content={renderTooltip} />
        {list.map((s) => {
          const c = colorOf(s.color)
          return (
            <Line
              key={s.key} yAxisId="rel" dataKey={s.key} name={s.key} type="linear"
              stroke={c} strokeWidth={2} connectNulls isAnimationActive={false}
              dot={s.pts.length <= 24 ? { r: 3, fill: c, stroke: 'var(--card)', strokeWidth: 1.5 } : false}
              activeDot={{ r: 4.5, fill: c, stroke: 'var(--card)', strokeWidth: 2 }}
            />
          )
        })}
      </LineChart>
    </ChartContainer>
  )
}

// Table view of the same series — the values without hovering.
export function ChartTable({ data, xHeader, yHeader, formatValue, formatX }) {
  return (
    <div className="max-h-52 overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead>{xHeader}</TableHead>
            <TableHead className="text-right">{yHeader}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...data].reverse().map((d, i) => (
            <TableRow key={i}>
              <TableCell className="text-muted-foreground">{formatX(d.x)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatValue(d.y)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
