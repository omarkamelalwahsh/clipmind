/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // "Nano Banana" accent palette
        banana: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
        },
        panel: {
          950: '#101112', // far left sidebar background
          900: '#131416', // main app background
          850: '#1b1c1e', // panel background
          800: '#1c1d20', // panel inner background
          750: '#222327', // element background
          700: '#2a2b2f', // border color / dark element
          600: '#383a3f', // lighter borders
          500: '#4c4e54',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-banana': '0 0 20px rgba(234, 179, 8, 0.25)',
        'glow-banana-sm': '0 0 10px rgba(234, 179, 8, 0.15)',
        'lift': '0 8px 25px rgba(0, 0, 0, 0.35)',
        'lift-sm': '0 4px 12px rgba(0, 0, 0, 0.25)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.35s ease-out',
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
