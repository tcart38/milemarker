import React, { useRef, useState, useLayoutEffect, useMemo, useId } from 'react'

// Lightweight single-series SVG chart (line or column) with crosshair/tooltip,
// keyboard navigation, and theme-aware colors. Data: [{ x: string, y: number }].

const PAD = { l: 46, r: 14, t: 16, b: 24 }

// Series color as literal Tailwind classes (dynamic class names would be purged).
const DEFAULT_COLOR = { stroke: 'stroke-accent', fill: 'fill-accent', fillHover: 'fill-accent-hover' }

function niceStep(range, target = 4) {
  const raw = range / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow
  return 10 * pow
}

function useWidth(ref) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

// Column with a 4px rounded data-end and a square baseline.
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

export default function TrendChart({
  data, type = 'line', formatValue, formatTick = formatValue, formatX, ariaLabel,
  height = 208, color = DEFAULT_COLOR,
}) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [hover, setHover] = useState(null) // point index or null

  const HEIGHT = height
  const n = data.length
  const geom = useMemo(() => {
    if (!width || n === 0) return null
    const iw = width - PAD.l - PAD.r
    const ih = HEIGHT - PAD.t - PAD.b
    const ys = data.map((d) => d.y)
    let lo = type === 'bar' ? 0 : Math.min(...ys)
    let hi = Math.max(...ys)
    if (hi === lo) hi = lo + (hi === 0 ? 1 : Math.abs(hi) * 0.1)
    const step = niceStep(hi - lo, HEIGHT <= 150 ? 3 : 4)
    const y0 = Math.floor(lo / step) * step
    const y1 = Math.ceil(hi / step) * step || step
    const ticks = []
    for (let t = y0; t <= y1 + step / 2; t += step) ticks.push(t)
    const slot = iw / n
    const px = (i) => PAD.l + slot * (i + 0.5)
    const py = (v) => PAD.t + ih * (1 - (v - y0) / (y1 - y0))
    return { iw, ih, y0, y1, ticks, slot, px, py }
  }, [width, n, data, type, HEIGHT])

  if (n === 0) return null

  const idxFromEvent = (e) => {
    const rect = wrapRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    return Math.max(0, Math.min(n - 1, Math.floor((x - PAD.l) / geom.slot)))
  }

  const onKey = (e) => {
    if (e.key === 'ArrowRight') { setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { setHover((h) => Math.max(0, (h ?? n) - 1)); e.preventDefault() }
    else if (e.key === 'Home') { setHover(0); e.preventDefault() }
    else if (e.key === 'End') { setHover(n - 1); e.preventDefault() }
    else if (e.key === 'Escape') setHover(null)
  }

  const showDots = type === 'line' && n <= 24
  // Unique per instance so two charts on one page can't share a gradient def.
  const gradientId = `trend-fade-${useId().replace(/:/g, '')}`
  const last = n - 1

  return (
    <div ref={wrapRef} className="relative select-none">
      {geom && (
        <svg
          width={width} height={HEIGHT} role="img" aria-label={ariaLabel}
          tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-lg"
          onPointerMove={(e) => setHover(idxFromEvent(e))}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {/* Fades the area wash out toward the axis so the line stays the subject. */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1" className={color.text}>
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines + y ticks — recessive hairlines, clean numbers */}
          {geom.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r} y1={geom.py(t)} y2={geom.py(t)}
                className="stroke-hairline/50" strokeWidth="1" />
              <text x={PAD.l - 8} y={geom.py(t) + 3} textAnchor="end"
                className="fill-tertiary text-[10px] tabular-nums">{formatTick(t)}</text>
            </g>
          ))}

          {/* X labels — sparse, auto-skipped */}
          {data.map((d, i) => {
            const every = Math.ceil(n / Math.max(2, Math.floor(geom.iw / 64)))
            if (i % every !== 0) return null
            return (
              <text key={i} x={geom.px(i)} y={HEIGHT - 6} textAnchor="middle"
                className="fill-tertiary text-[10px]">{formatX(d.x)}</text>
            )
          })}

          {/* Crosshair (line charts) */}
          {type === 'line' && hover != null && (
            <line x1={geom.px(hover)} x2={geom.px(hover)} y1={PAD.t} y2={HEIGHT - PAD.b}
              className="stroke-hairline" strokeWidth="1" />
          )}

          {type === 'bar' ? (
            data.map((d, i) => {
              // ≤24px thick, ≥2px surface gap between neighbors
              const bw = Math.max(2, Math.min(24, geom.slot * 0.7, geom.slot - 2))
              const x = geom.px(i) - bw / 2
              const y = geom.py(d.y)
              const h = HEIGHT - PAD.b - y
              return (
                <path key={i} d={barPath(x, y, bw, Math.max(h, 1))}
                  className={i === hover ? color.fillHover : color.fill} />
              )
            })
          ) : (
            <>
              {/* Area wash under the line */}
              <path
                d={`M${geom.px(0)},${geom.py(data[0].y)} ` + data.map((d, i) => `L${geom.px(i)},${geom.py(d.y)}`).join(' ') +
                   ` L${geom.px(last)},${HEIGHT - PAD.b} L${geom.px(0)},${HEIGHT - PAD.b} Z`}
                fill={`url(#${gradientId})`}
              />
              <path
                d={`M${geom.px(0)},${geom.py(data[0].y)} ` + data.map((d, i) => `L${geom.px(i)},${geom.py(d.y)}`).join(' ')}
                className={color.stroke} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"
              />
              {data.map((d, i) => {
                const isDot = showDots || i === last || i === hover
                if (!isDot) return null
                return (
                  <circle key={i} cx={geom.px(i)} cy={geom.py(d.y)} r={i === hover ? 4.5 : 3.5}
                    className={`${color.fill} stroke-surface`} strokeWidth="2" />
                )
              })}
            </>
          )}

          {/* Direct label on the latest value — text tokens, never the series color */}
          {hover == null && (
            <text
              x={type === 'bar' ? geom.px(last) : Math.min(geom.px(last), width - PAD.r) - 6}
              y={geom.py(data[last].y) - (type === 'bar' ? 5 : 9)}
              textAnchor={type === 'bar' ? 'middle' : 'end'}
              className="fill-secondary text-[11px] font-medium tabular-nums"
            >
              {formatValue(data[last].y)}
            </text>
          )}
        </svg>
      )}

      {/* Tooltip — value leads, label follows */}
      {geom && hover != null && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg text-center
                     bg-tooltip/95 text-white shadow-pop whitespace-nowrap"
          style={{
            left: Math.max(46, Math.min(width - 46, geom.px(hover))),
            top: geom.py(data[hover].y) - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-sm font-semibold num text-white">{formatValue(data[hover].y)}</div>
          <div className="text-[10px] text-white/60">{formatX(data[hover].x)}</div>
        </div>
      )}
    </div>
  )
}


/* ---------------------------------------------------------------------------
   Overlay chart

   Superimposes several metrics on one plot so you can see whether they move
   together — fuel price against economy, say. Two problems have to be solved
   honestly for that to mean anything:

   • Units and magnitudes differ wildly (30 mpg vs 500 mi vs $300), so a shared
     absolute axis would flatten everything but the largest series. Each series
     is therefore normalised to its OWN min..max, and the y-axis shows no
     numbers — the legend and tooltip carry the real values instead.
   • Granularity differs: economy and price are per fill-up, distance and spend
     are monthly. Both are mapped onto a continuous time axis, so a monthly
     point lands mid-month and the two line up correctly.
--------------------------------------------------------------------------- */

// "2026-03" -> mid-March; "2026-03-14" -> that day. Both become a timestamp so
// series of different granularity share one axis.
const toTime = (x) => (x.length === 7
  ? Date.parse(`${x}-15T00:00:00`)
  : Date.parse(`${x}T00:00:00`))

const fmtAxisDate = (t) => {
  const d = new Date(t)
  const m = d.toLocaleDateString(undefined, { month: 'short' })
  return d.getMonth() === 0 ? `${m} ${String(d.getFullYear()).slice(2)}` : m
}

export function OverlayChart({ series, height = 240, ariaLabel }) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [hoverT, setHoverT] = useState(null)

  const HEIGHT = height
  const PADO = { ...PAD, l: 14 } // no numeric axis, so no room needed for labels

  const geom = useMemo(() => {
    const withTimes = series
      .map((s) => ({
        ...s,
        pts: s.points.map((p) => ({ t: toTime(p.x), y: p.y, x: p.x })).sort((a, b) => a.t - b.t),
      }))
      .filter((s) => s.pts.length > 0)

    if (!width || withTimes.length === 0) return null

    const all = withTimes.flatMap((s) => s.pts.map((p) => p.t))
    const t0 = Math.min(...all)
    const t1 = Math.max(...all)
    const span = t1 - t0 || 1
    const iw = width - PADO.l - PADO.r
    const ih = HEIGHT - PADO.t - PADO.b

    const px = (t) => PADO.l + iw * ((t - t0) / span)

    // Each series gets its own vertical scale; a flat series sits mid-height
    // rather than collapsing onto the floor.
    const scaled = withTimes.map((s) => {
      const ys = s.pts.map((p) => p.y)
      const lo = Math.min(...ys)
      const hi = Math.max(...ys)
      const flat = hi === lo
      const py = (v) => (flat ? PADO.t + ih / 2 : PADO.t + ih * (1 - (v - lo) / (hi - lo)))
      return { ...s, lo, hi, py }
    })

    // ~5 evenly spaced time ticks across the domain.
    const ticks = Array.from({ length: 5 }, (_, i) => t0 + (span * i) / 4)
    return { iw, ih, t0, t1, span, px, scaled, ticks }
  }, [series, width, HEIGHT, PADO.l, PADO.r, PADO.t, PADO.b])

  const timeFromEvent = (e) => {
    const rect = wrapRef.current.getBoundingClientRect()
    const x = Math.max(PADO.l, Math.min(width - PADO.r, e.clientX - rect.left))
    return geom.t0 + ((x - PADO.l) / geom.iw) * geom.span
  }

  // The point in each series nearest the hovered time — series don't share
  // sample points, so "the value here" means "the closest reading".
  const readout = useMemo(() => {
    if (!geom || hoverT == null) return null
    return geom.scaled.map((s) => {
      let best = s.pts[0]
      for (const p of s.pts) if (Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT)) best = p
      return { key: s.key, label: s.label, color: s.color, point: best, formatValue: s.formatValue }
    })
  }, [geom, hoverT])

  return (
    <div ref={wrapRef} className="relative select-none">
      {geom && (
        <svg
          width={width} height={HEIGHT} role="img" aria-label={ariaLabel}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-lg"
          tabIndex={0}
          onPointerMove={(e) => setHoverT(timeFromEvent(e))}
          onPointerLeave={() => setHoverT(null)}
          onBlur={() => setHoverT(null)}
        >
          {/* Gridlines only — the axis is relative, so numbers would mislead. */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f} x1={PADO.l} x2={width - PADO.r}
              y1={PADO.t + geom.ih * f} y2={PADO.t + geom.ih * f}
              className="stroke-hairline/50" strokeWidth="1"
            />
          ))}

          {geom.ticks.map((t, i) => (
            <text key={i} x={geom.px(t)} y={HEIGHT - 6} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}
              className="fill-tertiary text-[10px]">{fmtAxisDate(t)}</text>
          ))}

          {hoverT != null && (
            <line x1={geom.px(hoverT)} x2={geom.px(hoverT)} y1={PADO.t} y2={HEIGHT - PADO.b}
              className="stroke-hairline" strokeWidth="1" />
          )}

          {geom.scaled.map((s) => (
            <g key={s.key}>
              <path
                d={s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${geom.px(p.t)},${s.py(p.y)}`).join(' ')}
                className={s.color.stroke} strokeWidth="2" fill="none"
                strokeLinejoin="round" strokeLinecap="round"
              />
              {s.pts.length <= 24 && s.pts.map((p, i) => (
                <circle key={i} cx={geom.px(p.t)} cy={s.py(p.y)} r="3"
                  className={`${s.color.fill} stroke-surface`} strokeWidth="1.5" />
              ))}
            </g>
          ))}

          {/* Marker on each series' nearest reading to the crosshair. */}
          {readout && geom.scaled.map((s) => {
            const r = readout.find((x) => x.key === s.key)
            if (!r) return null
            return (
              <circle key={s.key} cx={geom.px(r.point.t)} cy={s.py(r.point.y)} r="4.5"
                className={`${s.color.fill} stroke-surface`} strokeWidth="2" />
            )
          })}
        </svg>
      )}

      {geom && readout && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-2 rounded-lg
                     bg-tooltip/95 text-white shadow-pop whitespace-nowrap"
          style={{
            left: Math.max(70, Math.min(width - 70, geom.px(hoverT))),
            top: 4,
            transform: 'translateX(-50%)',
          }}
        >
          {readout.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-[11px] leading-5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.color.dot}`} />
              <span className="text-white/60">{r.label}</span>
              <span className="ml-auto font-semibold num text-white">{r.formatValue(r.point.y)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Table view of the same series — the values without hovering.
export function ChartTable({ data, xHeader, yHeader, formatValue, formatX }) {
  return (
    <div className="max-h-52 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-xs text-secondary border-b border-hairline/50">
            <th className="px-2 py-2 font-medium">{xHeader}</th>
            <th className="px-2 py-2 font-medium text-right">{yHeader}</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d, i) => (
            <tr key={i} className="border-b border-hairline/40 last:border-0">
              <td className="px-2 py-2 text-secondary">{formatX(d.x)}</td>
              <td className="px-2 py-2 text-right num">{formatValue(d.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
