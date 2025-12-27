import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' // манифест теперь в корне

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
})