const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
        sans: ['Manrope', ...defaultTheme.fontFamily.sans],
        brand: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: '#76b82a',
        'primary-dark': '#5f9f1f',
        graphite: '#3f4141',
        'graphite-dark': '#2f3131',
        background: '#f7f8f6',
        surface: '#ffffff',
        'surface-soft': '#f0f2ef',
        text: '#202322',
        'text-muted': '#66706a',
        border: '#dfe4df',
        success: '#4f9f2f',
        warning: '#c58a20',
        danger: '#b84232',
        info: '#3f6f8f',
      },
    },
  },
  plugins: [],
};
