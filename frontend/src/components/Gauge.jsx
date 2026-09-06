import React from 'react'

const clamp = (v) => Math.max(0, Math.min(1, v ?? 0))

/**
 * Horizontal progress track. Every progress indicator in the app is one of
 * these, so a reminder, a tread-life bar and a rotation interval all read the
 * same way and can be compared down a column at a glance.
 *
 * `colorClass` is a Tailwind background utility (`bg-ok-fill`, `bg-bad-fill`…),
 * so the fill follows the theme tokens. `marker` (0..1) drops a hairline tick,
 * for showing a threshold against the range.
 */
export function Bar({ value, colorClass = 'bg-info-fill', marker = null, className = '' }) {
  return (
    <div className={`relative h-1.5 rounded-full bg-inset overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-apple ${colorClass}`}
        style={{ width: `${Math.max(2, clamp(value) * 100)}%` }}
      />
      {marker != null && (
        <div
          className="absolute top-0 bottom-0 w-px bg-primary/40"
          style={{ left: `${clamp(marker) * 100}%` }}
        />
      )}
    </div>
  )
}
