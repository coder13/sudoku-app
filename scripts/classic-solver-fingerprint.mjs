import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// The certified Classic continuations depend on the detectors, deduction order,
// exact solver and generation quality rules. Compiler builds can hash differently.
export function classicSolverFingerprint() {
  const root = fileURLToPath(new URL('../crates/engine/src/', import.meta.url))
  const hash = createHash('sha256')
  const files = ['lib.rs', 'position.rs', 'logical.rs', 'technique.rs', 'hints.rs', 'generation.rs', 'subsets.rs', 'proofs.rs']
  for (const dir of ['logical', 'hints', 'patterns']) {
    const entries = readdirSync(join(root, dir), { recursive: true })
    files.push(...entries.filter(name => name.endsWith('.rs')).map(name => dir + '/' + name.split(sep).join('/')))
  }
  for (const name of files.sort()) {
    hash.update(name).update('\0').update(readFileSync(join(root, name), 'utf8').replaceAll('\r\n', '\n')).update('\0')
  }
  return hash.digest('hex')
}
