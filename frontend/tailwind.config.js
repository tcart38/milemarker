/** @type {import('tailwindcss').Config} */
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
        // Shared aesthetic with MotionBase — indigo accent on slate.
        brand: {
          DEFAULT: '#6366F1', // indigo-500
          hover: '#818CF8',   // indigo-400
          dim: '#4338CA',     // indigo-700
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
