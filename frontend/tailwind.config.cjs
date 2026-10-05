// Mantém a mesma sequência de fontes de reserva usada antes da migração.
const fontFallback = ['ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...fontFallback],
        brand: ['Manrope', ...fontFallback],
      },
      colors: {
        primary:          '#B6E23A',
        'primary-dark':   '#a3d130',
        'primary-soft':   '#f0f9d4',
        graphite:         '#2F2F2F',
        'graphite-mid':   '#5E5E5E',
        background:       '#EDEDED',
        surface:          '#ffffff',
        'surface-soft':   '#f5f5f5',
        text:             '#2F2F2F',
        'text-muted':     '#5E5E5E',
        border:           '#EDEDED',
        success:          '#4f9f2f',
        warning:          '#c58a20',
        danger:           '#b84232',
        info:             '#3f6f8f',
      },
    },
  },
  plugins: [],
};
