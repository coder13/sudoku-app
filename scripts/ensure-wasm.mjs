import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { appEngineProfile, featuresForProfile } from './engine-build-profiles.mjs'
import { buildBrowserEngine } from './build-wasm.mjs'

const outputs = [
  'src/sudoku/generated/engine.wasm',
  'src/sudoku/generated/engine-profile.json',
  'src/sudoku/generated/lesson-examples.json',
  'src/sudoku/generated/lesson-difficulties.json',
  'src/sudoku/generated/lesson-aliases.json',
].map((path) => resolve(path))

function latestModified(path) {
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return Math.max(...readdirSync(path, { withFileTypes: true }).map((entry) =>
    latestModified(resolve(path, entry.name))))
}

const sources = ['Cargo.lock', 'Cargo.toml', 'crates/engine', 'scripts/build-wasm.mjs', 'scripts/engine-build-profiles.mjs', 'scripts/classic-solver-fingerprint.mjs'].map((path) => resolve(path))
function hasAppProfile() {
  try {
    const manifest = JSON.parse(readFileSync(resolve('src/sudoku/generated/engine-profile.json'), 'utf8'))
    return manifest.profile === appEngineProfile &&
      JSON.stringify(manifest.features) === JSON.stringify(featuresForProfile(appEngineProfile))
  } catch {
    return false
  }
}

const generatedIsCurrent = outputs.every(existsSync) && hasAppProfile() &&
  Math.min(...outputs.map((path) => statSync(path).mtimeMs)) >= Math.max(...sources.map(latestModified))

if (generatedIsCurrent) {
  console.log('Browser engine is current; skipping the Rust build.')
} else {
  await buildBrowserEngine(appEngineProfile)
}
