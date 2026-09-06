/** @type {import('tailwindcss').Config} */

// Semantic colours resolve through CSS custom properties defined in index.css,
// so `bg-surface` / `text-secondary` are correct in both themes and no component
// needs a `dark:` twin. Values are space-separated RGB channels so Tailwind's
// opacity modifiers (`text-secondary/60`, `bg-accent/10`) still work.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // These classes are built dynamically (`badge-${r.urgency}`, `badge-${r.type}`),
  // so the content scan never sees them literally.
  safelist: [
    'badge-overdue', 'badge-due-soon', 'badge-upcoming', 'badge-not-due',
    'badge-service', 'badge-repair', 'badge-upgrade',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces, back to front.
        canvas: token('canvas'),
        surface: token('surface'),
        inset: token('inset'),
        elevated: token('elevated'),
        hairline: token('hairline'),
        // Neutral hover/press wash — dark ink on light, light ink on dark.
        wash: token('wash'),
        tooltip: token('tooltip'),

        // Text.
        primary: token('text-1'),
        secondary: token('text-2'),
        tertiary: token('text-3'),

        // Apple system blue. `brand` stays as an alias so any stray reference
        // keeps resolving to the accent rather than silently going transparent.
        accent: { DEFAULT: token('accent'), hover: token('accent-hover') },
        brand: { DEFAULT: token('accent'), hover: token('accent-hover') },

        // Semantic status — green good, amber attention, red overdue.
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
        info: token('info'),
        violet: token('violet'),

        // Deeper variants for text drawn on a tint of the same hue (badges),
        // where the tint would otherwise eat the contrast ratio.
        'ok-ink': token('ok-ink'),
        'warn-ink': token('warn-ink'),
        'bad-ink': token('bad-ink'),
        'info-ink': token('info-ink'),
        'violet-ink': token('violet-ink'),

        // Vivid variants for large graphics (bars, rings, chart series).
        'ok-fill': token('ok-fill'),
        'warn-fill': token('warn-fill'),
        'bad-fill': token('bad-fill'),
        'info-fill': token('info-fill'),
        'violet-fill': token('violet-fill'),
        'accent-fill': token('info-fill'),
      },
      fontFamily: {
        // The Apple aesthetic comes from SF itself, so ask for the system face
        // rather than shipping a webfont; other platforms fall back gracefully.
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"',
          '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
      },
      fontSize: {
        // SF's optical sizes: display text tightens, small text opens up.
        '2xs': ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0' }],
        xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0' }],
        sm: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '-0.005em' }],
        base: ['0.9375rem', { lineHeight: '1.3125rem', letterSpacing: '-0.01em' }],
        lg: ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '-0.015em' }],
        xl: ['1.3125rem', { lineHeight: '1.625rem', letterSpacing: '-0.02em' }],
        '2xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.025em' }],
        '3xl': ['2.125rem', { lineHeight: '2.375rem', letterSpacing: '-0.03em' }],
        '4xl': ['2.75rem', { lineHeight: '3rem', letterSpacing: '-0.032em' }],
      },
      borderRadius: {
        // Bigger, softer corners — closer to the continuous curves Apple uses.
        lg: '0.625rem',   // 10px — controls
        xl: '0.875rem',   // 14px — inner tiles
        '2xl': '1.125rem', // 18px — cards
        '3xl': '1.5rem',  // 24px — sheets
      },
      boxShadow: {
        // Light mode leans on a whisper of shadow; dark mode leans on the
        // lightness step between #000 and #1C1C1E and adds none.
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
        pop: '0 4px 12px rgb(0 0 0 / 0.08), 0 12px 32px rgb(0 0 0 / 0.12)',
        sheet: '0 -4px 24px rgb(0 0 0 / 0.12)',
      },
      transitionTimingFunction: {
        // Apple's standard ease — quick out, gentle settle.
        apple: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
