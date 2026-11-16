import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const outputs = [
  'src/sudoku/generated/engine.wasm',
  'src/sudoku/generated/lesson-examples.json',
  'src/sudoku/generated/lesson-difficulties.json',
].map((path) => resolve(path))

function latestModified(path) {
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return Math.max(...readdirSync(path, { withFileTypes: true }).map((entry) =>
    latestModified(resolve(path, entry.name))))
}

const sources = ['Cargo.lock', 'Cargo.toml', 'crates/engine'].map((path) => resolve(path))
const generatedIsCurrent = outputs.every(existsSync) &&
  Math.min(...outputs.map((path) => statSync(path).mtimeMs)) >= Math.max(...sources.map(latestModified))

if (generatedIsCurrent) {
  console.log('Browser engine is current; skipping the Rust build.')
} else {
  await import('./build-wasm.mjs')
}
