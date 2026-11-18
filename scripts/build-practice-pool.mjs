import { readFileSync, writeFileSync } from 'node:fs'

const bytes = readFileSync(new URL('../src/sudoku/generated/engine.wasm', import.meta.url))
const { instance: { exports: engine } } = await WebAssembly.instantiate(bytes)
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function request(input) {
  const bytes = encoder.encode(JSON.stringify(input))
  const address = engine.request_buffer(bytes.length)
  new Uint8Array(engine.memory.buffer, address, bytes.length).set(bytes)
  const length = engine.run_request()
  const result = JSON.parse(decoder.decode(new Uint8Array(engine.memory.buffer, engine.response_buffer(), length)))
  if ('error' in result) throw new Error(result.error)
  return result.value
}

const topics = ['naked-single', 'hidden-single', 'pointing', 'claiming', 'naked-pair', 'x-wing']
const positionsPerTopic = 12
const pool = new Map(topics.map((id) => [id, []]))
const usedGivens = new Set()
const { difficultyOrder: techniqueOrder } = request({ type: 'techniques' })

// Use one position per independently generated puzzle. Verify the hint against
// the restored position because the trace and the hint search can break ties differently.
for (let seed = 1; seed <= 16_000 && topics.some((id) => pool.get(id).length < positionsPerTopic); seed++) {
  engine.generate_board(seed)
  const givens = new Uint8Array(engine.memory.buffer, engine.board_buffer(), 81).join('')
  if (usedGivens.has(givens)) continue
  const { steps, positions } = request({
    type: 'logical-solve', values: givens, techniqueOrder, includePositions: true, includeStepDetails: true,
  })
  for (const technique of topics.toReversed()) {
    const exercises = pool.get(technique)
    if (exercises.length >= positionsPerTopic) continue
    const indices = steps.flatMap((step, index) => step.technique === technique ? [index] : [])
    for (let offset = 0; offset < indices.length; offset++) {
      const { entries, eliminations, candidates } = positions[indices[(seed + offset) % indices.length]]
      const values = [...givens].map((digit, cell) => digit === '0' ? entries[cell] : digit).join('')
      if ([...values].filter((digit) => digit === '0').length < 18) continue
      const hint = request({ type: 'next-deduction', values, eliminations })
      if (hint?.technique !== technique) continue
      exercises.push({ givens, entries, eliminations, candidates, hint })
      usedGivens.add(givens)
      break
    }
    if (usedGivens.has(givens)) break
  }
}

for (const [technique, exercises] of pool) {
  if (exercises.length !== positionsPerTopic) throw new Error(`Found only ${exercises.length} positions for ${technique}`)
}
writeFileSync(new URL('../src/sudoku/practice-positions.json', import.meta.url),
  `[\n${Array.from(pool.values()).flat().map((item) => JSON.stringify(item)).join(',\n')}\n]\n`)
console.log(`Verified ${usedGivens.size} practice positions.`)
