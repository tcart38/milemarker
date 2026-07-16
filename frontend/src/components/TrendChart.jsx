import React, { useRef, useState, useLayoutEffect, useMemo } from 'react'

// Lightweight single-series SVG chart (line or column) with crosshair/tooltip,
// keyboard navigation, and theme-aware colors. Data: [{ x: string, y: number }].

const PAD = { l: 46, r: 14, t: 16, b: 24 }

// Series color as literal Tailwind classes (dynamic class names would be purged).
const DEFAULT_COLOR = { stroke: 'stroke-brand', fill: 'fill-brand', fillHover: 'fill-brand-hover' }

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
  const last = n - 1

  return (
    <div ref={wrapRef} className="relative select-none">
      {geom && (
        <svg
          width={width} height={HEIGHT} role="img" aria-label={ariaLabel}
          tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-lg"
          onPointerMove={(e) => setHover(idxFromEvent(e))}
          onPointerLeave={() => setHover(null)}
        >
          {/* Gridlines + y ticks — recessive hairlines, clean numbers */}
          {geom.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r} y1={geom.py(t)} y2={geom.py(t)}
                className="stroke-slate-200 dark:stroke-white/[0.07]" strokeWidth="1" />
              <text x={PAD.l - 8} y={geom.py(t) + 3} textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] tabular-nums">{formatTick(t)}</text>
            </g>
          ))}

          {/* X labels — sparse, auto-skipped */}
          {data.map((d, i) => {
            const every = Math.ceil(n / Math.max(2, Math.floor(geom.iw / 64)))
            if (i % every !== 0) return null
            return (
              <text key={i} x={geom.px(i)} y={HEIGHT - 6} textAnchor="middle"
                className="fill-slate-400 dark:fill-slate-500 text-[10px]">{formatX(d.x)}</text>
            )
          })}

          {/* Crosshair (line charts) */}
          {type === 'line' && hover != null && (
            <line x1={geom.px(hover)} x2={geom.px(hover)} y1={PAD.t} y2={HEIGHT - PAD.b}
              className="stroke-slate-300 dark:stroke-white/20" strokeWidth="1" />
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
                className={color.fill} fillOpacity="0.08"
              />
              <path
                d={`M${geom.px(0)},${geom.py(data[0].y)} ` + data.map((d, i) => `L${geom.px(i)},${geom.py(d.y)}`).join(' ')}
                className={color.stroke} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"
              />
              {data.map((d, i) => {
                const isDot = showDots || i === last || i === hover
                if (!isDot) return null
                return (
                  <circle key={i} cx={geom.px(i)} cy={geom.py(d.y)} r="4"
                    className={`${color.fill} stroke-white dark:stroke-slate-800`} strokeWidth="2" />
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
              className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium tabular-nums"
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
                     bg-slate-900/95 dark:bg-slate-700 text-white shadow-lg whitespace-nowrap"
          style={{
            left: Math.max(46, Math.min(width - 46, geom.px(hover))),
            top: geom.py(data[hover].y) - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-sm font-semibold tabular-nums">{formatValue(data[hover].y)}</div>
          <div className="text-[10px] text-slate-300">{formatX(data[hover].x)}</div>
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
        <thead className="sticky top-0 bg-white dark:bg-slate-800">
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
            <th className="px-2 py-1.5 font-medium">{xHeader}</th>
            <th className="px-2 py-1.5 font-medium text-right">{yHeader}</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-white/[0.04] last:border-0">
              <td className="px-2 py-1.5">{formatX(d.x)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(d.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
