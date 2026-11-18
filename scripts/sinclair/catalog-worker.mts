import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { classicSymbol, sinclairEventDistance, sinclairSelection } from '../../src/sudoku/sinclair-score.ts'
import type { Difficulty, VariantPuzzle } from '../../src/sudoku/engine.ts'
import type { VariantId } from '../../src/sudoku/variants.ts'

// Omit the namespace to replay the original edition's seed sequence.
export function catalogSeed(key: string) {
  const seed = process.env.SINCLAIR_SEED
  return createHash('sha256').update(seed ? seed + '\0' + key : key).digest().readUInt32BE(0)
}

export function worker(timeoutMs = 0) {
  const start = () => {
    const child = spawn('target/release/examples/sinclair', [], { stdio: ['pipe', 'pipe', 'inherit'] })
    return { child, lines:createInterface({ input:child.stdout })[Symbol.asyncIterator]() }
  }
  let process = start()
  return { close: () => process.child.stdin.end(), async call(request: Record<string, unknown>) {
    let expired = false
    const timer = timeoutMs ? setTimeout(() => { expired = true; process.child.kill('SIGKILL') },timeoutMs) : undefined
    try {
      process.child.stdin.write(JSON.stringify(request) + '\n')
      const line = await process.lines.next()
      if (expired) { process = start(); return null }
      if (line.done) throw Error('Native constructor closed during ' + JSON.stringify(request).slice(0, 300))
      return JSON.parse(line.value)
    } finally { clearTimeout(timer) }
  } }
}

type NativeCandidate = {
  puzzle: VariantPuzzle; solution: string; answerKey: string; points: number; hardest: string; version: number
  events: [string, boolean, number, number, number][]
}

export function score(family: VariantId, tier: Difficulty, seed: number, index: number, raw: NativeCandidate) {
  const events = raw.events.map(([id, diagonal, placements, eliminations, cell]) =>
    ({ token: diagonal ? 'diagonal' : classicSymbol(id), placements, eliminations, cell }))
  const distance = sinclairEventDistance(family, tier, events)
  const style = sinclairSelection('catalog', raw.puzzle, distance)
  return { family, tier, seed, index, puzzle: raw.puzzle, solution: raw.solution, answerKey: raw.answerKey,
    points: raw.points, hardest: raw.hardest, version: raw.version, techniques: [...new Set(raw.events.map(e => e[0]))],
    steps: events.length, opening: events.slice(0, 6).map(e => e.token).join('/'), distance,
    pairing: style.pairing.score, rank: style.rank }
}

export type Candidate = ReturnType<typeof score>
