/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-horizontal': 'bounce-horizontal 1s infinite',
        'progress': 'progress 1s ease-in-out infinite',
        'slide-up-fade': 'slide-up-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down-fade': 'slide-down-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'bounce-horizontal': {
          '0%, 100%': { transform: 'translateX(-25%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
          '50%': { transform: 'translateX(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
        },
        'progress': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'slide-up-fade': {
          '0%': { opacity: 0, transform: 'translateY(2px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-down-fade': {
          '0%': { opacity: 0, transform: 'translateY(-2px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} 