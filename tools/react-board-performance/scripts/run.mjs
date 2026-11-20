import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'

const directory = fileURLToPath(new URL('..', import.meta.url))
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
let server
try {
  // Build, server, and browser share one process tree. Nothing relies on a server from an earlier shell call.
  await build({ configFile })
  server = await preview({ configFile })
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./browser.mjs', import.meta.url)), ...process.argv.slice(2)],
      { cwd: directory, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
} finally {
  if (server) await new Promise(resolve => server.httpServer.close(resolve))
}
