import type { VariantPuzzle, VariantRule } from '../engine.ts'
import type { FogDefinition } from '../fog.ts'
import { isPlayablePuzzle, variantIdForPuzzle } from '../variants.ts'
import { canonicalCoachCode } from './coach-code.ts'
import type { ImportResult } from './types.ts'

export const MAX_IMPORT_LENGTH = 20_000
export const MAX_DECODED_LENGTH = 128_000

const sourceHashes = new WeakMap<object, { fingerprint: string; hash: Promise<string> }>()
const coachProgressFields = new Set([
  'userDigits', 'userCellCandidates', 'userBoxCandidates', 'userColours', 'userCellCandidatesColours',
])

function stableCoachSource(value: unknown, topLevel = false): string {
  if (Array.isArray(value)) return `[${value.map(item => stableCoachSource(item)).join(',')}]`
  if (record(value)) {
    const keys = Object.keys(value).filter(key => !(topLevel && coachProgressFields.has(key))).sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableCoachSource(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Hash puzzle semantics once across reviewed-import checks, ignoring supported player progress. */
export function sourceHash(code: string, payload: object): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return Promise.resolve(undefined)
  // Keep the Coach format version in the digest, but hash decoded puzzle data
  // so adding player progress does not disable source-specific import rules.
  const header = /^SCv([0-9]+)_([0-9]+)_/i.exec(code)
  const legacyHeader = /^SCv([3-6])_/i.exec(code)
  const fingerprint = header
    ? `SCv${header[1]}_${header[2]}_${stableCoachSource(payload, true)}`
    : legacyHeader ? `SCv${legacyHeader[1]}_${stableCoachSource(payload, true)}`
    : canonicalCoachCode(code)
  const cached = sourceHashes.get(payload)
  if (cached?.fingerprint === fingerprint) return cached.hash
  const digest = crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)).then(bytes =>
    Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''))
  const hash = digest.catch(error => {
    if (sourceHashes.get(payload)?.hash === hash) sourceHashes.delete(payload)
    throw error
  })
  sourceHashes.set(payload, { fingerprint, hash })
  return hash
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function hasData(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (record(value)) return Object.keys(value).length > 0
  return value !== undefined && value !== null && value !== false && value !== ''
}

export function standardRegion(cell: number) {
  return Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
}

export function readRegions(labels: unknown): VariantPuzzle['regions'] {
  if (labels === undefined) return
  if (!Array.isArray(labels) || labels.length !== 81 ||
    labels.some((label) => !Number.isInteger(label) || label < 0 || label > 9)) {
    throw new Error('This puzzle has an invalid region map.')
  }
  const groups = new Map<number, number[]>()
  labels.forEach((label, cell) => {
    const group = groups.get(label)
    if (group) group.push(cell)
    else groups.set(label, [cell])
  })
  const regions = [...groups.values()]
  if (regions.length === 9 && regions.every((region) => region.length === 9 &&
    region.every((cell) => standardRegion(cell) === standardRegion(region[0])))) return
  return { type: 'jigsaw', regions }
}

export function hasMiniBoxes(labels: unknown): boolean {
  if (!Array.isArray(labels) || labels.length !== 16 || labels.some(label => !Number.isInteger(label) || label < 0)) return false
  const topLeftCells = [0, 2, 8, 10]
  const expected = topLeftCells.map(cell => labels[cell])
  return new Set(expected).size === 4 && labels.every((label, cell) =>
    label === expected[Math.floor(cell / 8) * 2 + Math.floor(cell % 4 / 2)])
}

export function makeImportedPuzzle(givens: string, rules: VariantRule[], regions: VariantPuzzle['regions'], fog?: FogDefinition): ImportResult {
  const puzzle: VariantPuzzle = { version: 1, givens, ...(regions && { regions }), ...(rules.length && { rules }) }
  // Validate the complete rule list before using it to choose a display name.
  if (!rules.length && !regions && !fog) return { givens }
  if (!isPlayablePuzzle('mixed', puzzle, fog)) throw new Error('This puzzle has unsupported or invalid rules.')
  const id = fog ? 'mixed' : variantIdForPuzzle(puzzle)
  if (id === 'classic') return { givens }
  return { givens, variant: { id, puzzle, ...(fog && { fog }) } }
}

export function parseJSON(text: string, format: string, limit = MAX_DECODED_LENGTH): unknown {
  try {
    if (text && text.length <= limit) return JSON.parse(text)
  } catch { /* Show a format-specific error below. */ }
  throw new Error(`This ${format} puzzle is unreadable. Copy it again and try once more.`)
}

export function jigsawLayoutError(size: 3 | 4 | 5 | 6 | 7) {
  const count = size === 3 ? 'three' : size === 4 ? 'four' : size === 5 ? 'five' : size === 6 ? 'six' : 'seven'
  return `A ${size} × ${size} Jigsaw grid needs ${count} connected regions of ${count} cells.`
}
