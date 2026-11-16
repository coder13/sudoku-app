import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const target = resolve(process.env.CARGO_TARGET_DIR ?? 'target')
execFileSync('cargo', [
  'build', '--locked', '--release', '-p', 'sudoku-app-engine', '--features', 'wasm-api',
  '--target', 'wasm32-unknown-unknown', '--target-dir', target,
], { stdio: 'inherit' })

const bytes = readFileSync(resolve(target, 'wasm32-unknown-unknown/release/sudoku_app_engine.wasm'))
const { instance } = await WebAssembly.instantiate(bytes)
const engine = instance.exports

function request(type) {
  const input = new TextEncoder().encode(JSON.stringify({ type }))
  const address = engine.request_buffer(input.length)
  new Uint8Array(engine.memory.buffer, address, input.length).set(input)
  const length = engine.run_request()
  const response = new Uint8Array(engine.memory.buffer, engine.response_buffer(), length)
  const { value, error } = JSON.parse(new TextDecoder().decode(response))
  if (!value) throw new Error(error ?? `The engine returned no result for ${type}.`)
  return value
}

const examples = request('lesson-examples')
const { techniques } = request('techniques')
const difficulties = Object.fromEntries(techniques.map(({ id, difficulty }) => [id, difficulty]))

mkdirSync('src/sudoku/generated', { recursive: true })
writeFileSync('src/sudoku/generated/engine.wasm', bytes)
writeFileSync('src/sudoku/generated/lesson-examples.json', `${JSON.stringify(examples)}\n`)
writeFileSync('src/sudoku/generated/lesson-difficulties.json', `${JSON.stringify(difficulties)}\n`)
