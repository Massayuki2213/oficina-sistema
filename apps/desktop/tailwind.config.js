/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        petroleo: { DEFAULT: '#0F3D57', deep: '#0B2E42' },
        laranja: { DEFAULT: '#F26522', deep: '#D9541A' },
        grafite: '#1E2A33',
        verde: { DEFAULT: '#2FB37A', bg: '#E4F5EE' },
        vermelho: { DEFAULT: '#E24C4B', bg: '#FBE7E7' },
        amarelo: { DEFAULT: '#C98A00', bg: '#FAF0D6' },
        azul: { DEFAULT: '#1A5A7D', bg: '#E6EFF4' },
        linha: '#DCE4EA',
        fundo: '#EEF2F5',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
