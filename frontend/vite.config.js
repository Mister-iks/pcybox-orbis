import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/ws':       { target: 'ws://localhost:8000', ws: true },
      '/graph':    { target: 'http://localhost:8000' },
      '/devices':  { target: 'http://localhost:8000' },
      '/alerts':   { target: 'http://localhost:8000' },
      '/timeline': { target: 'http://localhost:8000' },
      '/capture':  { target: 'http://localhost:8000' },
      '/media':    { target: 'http://localhost:8000' },
    },
  },
})
