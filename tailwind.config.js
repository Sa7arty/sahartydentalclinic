/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#12151f',
          900: '#1a1f2e',
          800: '#232a3d',
          700: '#2e3650',
        },
        gold: {
          400: '#e8c088',
          500: '#d4a462',
          600: '#b8874a',
        },
      },
    },
  },
  plugins: [],
}
