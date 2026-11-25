import { validFractionalRegions, type FractionalRegionsRule } from './fractional-regions.ts'

// The drawing in h4nv's Jigsaw Problem 5×5 encodes the rule described in its publication.
// Match the whole export so unrelated artwork never becomes an active constraint.
const REVIEWED_EXPORT = 'dc4f95b7f1f3ca2acae1c64043b9b4743cecac13a49fd8ac51ff306970133c31'

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export async function readCoachFractionalRegions(code: string, value: unknown, size: number) {
  if (!Array.isArray(value)) return
  const shapes = value.filter(layer => object(layer) && layer.type === 'cosmeticShape')
  if (shapes.length < 2 || size !== 5) return
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim()))
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (key !== REVIEWED_EXPORT) return

  const pieces = shapes.map(({ settings, segments }) => ({
    color: settings.colour,
    quarters: segments.map(({ cells: [[x, y]] }: { cells: [[number, number]] }) =>
      Math.floor(2 * y) * (2 * size) + Math.floor(2 * x)),
  }))
  if (!validFractionalRegions(pieces, size, 0)) throw new Error('This Sudoku Coach export has invalid fractional regions.')
  const rule: FractionalRegionsRule = { type: 'fractional-regions', pieces }
  return { rule, artwork: new Set(value.filter(layer => object(layer) &&
    (layer.type === 'cosmeticShape' || layer.type === 'cosmeticLine'))) }
}
