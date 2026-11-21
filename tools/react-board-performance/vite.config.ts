import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const repository = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root, base: './', plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 8784, strictPort: true, fs: { allow: [repository] } },
  preview: { host: '127.0.0.1', port: 8785, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
})
