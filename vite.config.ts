import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/magicgem/',   // ← Change 'LINE98' to your GitHub repo name if different
})
