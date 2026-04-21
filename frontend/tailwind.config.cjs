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
        primary: '#9d7d4d',
        'primary-dark': '#8f7144',
        secondary: '#6d6558',
        light: '#ede3d0',
        dark: '#2f3a2d',
        'dark-card': '#fffaf1',
      },
    },
  },
  plugins: [],
};
