// Date display, driven by the "date_format" setting.
//
// Dates are stored as 'YYYY-MM-DD' strings everywhere; these helpers only
// change how they're shown. The active format lives at module level so the
// many small helpers that render dates don't each need the settings context.
// SettingsProvider keeps it in sync (see setDateFormat).

export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY/MM/DD']
export const DEFAULT_DATE_FORMAT = 'MM/DD/YYYY'

let current = DEFAULT_DATE_FORMAT

export function setDateFormat(fmt) {
  current = DATE_FORMATS.includes(fmt) ? fmt : DEFAULT_DATE_FORMAT
}

export const getDateFormat = () => current

// Split a 'YYYY-MM-DD' (or Date) into zero-padded parts.
function parts(d) {
  if (d instanceof Date) {
    if (isNaN(d)) return null
    return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')]
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  return m ? [m[1], m[2], m[3]] : null
}

// Full date in the chosen format, e.g. 11/23/2026 · 23/11/2026 · 2026/11/23.
export function formatDate(d, fmt = current) {
  if (!d) return '—'
  const p = parts(d)
  if (!p) return String(d)
  const [y, m, day] = p
  if (fmt === 'DD/MM/YYYY') return `${day}/${m}/${y}`
  if (fmt === 'YYYY/MM/DD') return `${y}/${m}/${day}`
  return `${m}/${day}/${y}`
}

// Day and month only (chart axes), in the chosen order, e.g. 11/23 or 23/11.
export function formatDayMonth(d, fmt = current) {
  const p = parts(d)
  if (!p) return ''
  const m = String(Number(p[1])), day = String(Number(p[2]))
  return fmt === 'DD/MM/YYYY' ? `${day}/${m}` : `${m}/${day}`
}
