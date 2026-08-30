/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wa: {
          light: '#25D366',
          dark: '#075E54',
          teal: '#128C7E',
          blue: '#34B7F1',
          bg: '#111b21',
          panel: '#202c33',
          card: '#182229',
          border: '#2a3942',
          bubble: '#005c4b',
          bubbleIn: '#202c33',
          text: '#e9edef',
          muted: '#8696a0'
        },
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave': 'wave 1.2s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1.2)' }
        }
      }
    },
  },
  plugins: [],
}
