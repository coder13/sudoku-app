import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

const directory = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
let server
try {
  if (!args.includes('--url')) {
    if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
      throw new Error('Build the prototype with npm run build before running the comparison.')
    }
    server = await preview({ root: directory, preview: { host: '127.0.0.1', port: 8775, strictPort: true } })
  }
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./benchmark.mjs', import.meta.url)), ...args],
      { cwd: directory, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
} finally {
  if (server) await new Promise(resolve => server.httpServer.close(resolve))
}
