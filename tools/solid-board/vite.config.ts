import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const repository = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root,
  base: './',
  plugins: [solid({ include: /\.solid\.tsx$/, refresh: false }), react({ exclude: /\.solid\.tsx$/ })],
  resolve: { dedupe: ['react', 'react-dom', 'solid-js', '@solidjs/web'] },
  server: { host: '127.0.0.1', port: 8774, strictPort: true, fs: { allow: [repository] } },
  preview: { host: '127.0.0.1', port: 8775, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
})
