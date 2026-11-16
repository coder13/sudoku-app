import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const target = resolve(process.env.CARGO_TARGET_DIR ?? 'target')
execFileSync('cargo', [
  'build', '--locked', '--release', '-p', 'sudoku-app-engine',
  '--target', 'wasm32-unknown-unknown', '--target-dir', target,
], { stdio: 'inherit' })
mkdirSync('src/sudoku/generated', { recursive: true })
copyFileSync(
  resolve(target, 'wasm32-unknown-unknown/release/sudoku_app_engine.wasm'),
  'src/sudoku/generated/engine.wasm',
)
