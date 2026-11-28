import { validFractionalRegions, type FractionalRegionsRule } from './fractional-regions.ts'
import { sourceHash } from './puzzle-import/shared.ts'

// The drawing in h4nv's Jigsaw Problem 5×5 encodes the rule described in its publication.
const REVIEWED_EXPORT = '0a76dac64740371b8dae85abef243164866a6441d5b184d8abcf73a7b09e1d30'
const REVIEWED_LAYER_COUNT = 6

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export async function readCoachFractionalRegions(code: string, data: Record<string, unknown>, size: number) {
  const value = data.givenConstraints
  if (!Array.isArray(value)) return
  const sourceLayers = value.slice(0, REVIEWED_LAYER_COUNT)
  const shapes = sourceLayers.filter(layer => object(layer) && layer.type === 'cosmeticShape')
  if (shapes.length < 2 || size !== 5) return
  const key = await sourceHash(code.trim(), { ...data, givenConstraints: sourceLayers })
  if (key !== REVIEWED_EXPORT) return

  const pieces = shapes.map(({ settings, segments }) => ({
    color: settings.colour,
    quarters: segments.map(({ cells: [[x, y]] }: { cells: [[number, number]] }) =>
      Math.floor(2 * y) * (2 * size) + Math.floor(2 * x)),
  }))
  if (!validFractionalRegions(pieces, size, 0)) throw new Error('This Sudoku Coach export has invalid fractional regions.')
  const rule: FractionalRegionsRule = { type: 'fractional-regions', pieces }
  return { rule, artwork: new Set(sourceLayers.filter(layer => object(layer) &&
    (layer.type === 'cosmeticShape' || layer.type === 'cosmeticLine'))) }
}
