import type { VariantRule } from './engine.ts'

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}

const reviewedExport = 'd132b7f78337e31d2c433c56d70264ac46a31d7d507952c5581f661b7dcf79f9'
const reviewedPaths = [
  [40,41,50,49,48,39,30,31,32], [33,42,51,60,59,58,57,56,47], [38,29,20,21],
  [22,23,24,25,34,43,52,61,70,69], [68,67,66,65], [64,55], [46,37], [28,19,10,11,12],
  [13,14,15,16,17,26,35,44,53,62,71], [80,79], [77,76,75], [74,73], [72,63,54,45],
  [36,27], [18,9], [0,1,2], [3,4,5], [6,7,8],
] as const

/** Recover the broken joins in the exact Entropic Spiral export from its path order. */
export async function readReviewedCoachEntropyBreaks(code: string, data: Record<string, unknown>): Promise<{
  rules: readonly Extract<VariantRule, { type: 'forbidden-entropic-connection' }>[]
} | undefined> {
  if (!globalThis.crypto?.subtle) return
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== reviewedExport || data.gridSize !== 9 || !Array.isArray(data.givenConstraints) ||
    !data.givenConstraints.every(record)) return

  const layers = data.givenConstraints
  const paths = layers.filter(layer => layer.type === 'entropicLine')
  if (paths.length !== 1 || layers.filter(layer => layer.type === 'cosmeticText').length !== 0) return
  const [layer] = paths
  if (!exactKeys(layer, ['id', 'type', 'segments', 'settings']) || !record(layer.settings) ||
    Object.keys(layer.settings).length !== 0 || !Array.isArray(layer.segments) ||
    layer.segments.length !== reviewedPaths.length) return

  const cells: number[][] = []
  for (const [index, segment] of layer.segments.entries()) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      !record(segment.parameters) || Object.keys(segment.parameters).length !== 0 ||
      !segment.cells.every(cell => Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) < 81) ||
      JSON.stringify(segment.cells) !== JSON.stringify(reviewedPaths[index])) return
    cells.push(segment.cells as number[])
  }

  const rules: Extract<VariantRule, { type: 'forbidden-entropic-connection' }>[] = []
  for (let index = 0; index + 1 < cells.length; index++) {
    const left = cells[index], right = cells[index + 1]
    if (left.length < 2 || right.length < 2) continue
    const last = left.at(-1)!, first = right[0]
    if (Math.abs(Math.floor(last / 9) - Math.floor(first / 9)) + Math.abs(last % 9 - first % 9) !== 1) continue
    rules.push({ type: 'forbidden-entropic-connection', cells: [left.at(-2)!, last, first, right[1]] })
  }
  if (rules.length !== 16) return
  return { rules }
}
