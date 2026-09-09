/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sino: {
          bg: '#F5F3EE',
          paper: '#FBFAF7',
          ink: '#181817',
          green: '#B6D83B',
          orange: '#FF6B35',
          blue: '#5B8DEF',
          pink: '#E86A92',
        },
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
