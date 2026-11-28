import type { AuthoredMark } from '../authored-artwork.ts'
import type { VariantRule } from '../engine.ts'
import { sourceHash } from './shared.ts'

type Point = readonly [number, number]

export type CoachTextClueSource = {
  givens: string
  settings: {
    gridResolution: 4
    positionVerticalOffset: 8
    colour: '#ff8080'
    textSize: 39
  }
  clues: readonly { point: Point; text: string }[]
  otherRules: readonly unknown[]
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}

function point(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate =>
    typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate < 9)
}

/** Decode the reviewed Neighbor Match instructions and retain their text artwork. */
export async function readReviewedCoachTextClues(code: string, data: Record<string, unknown>): Promise<{
  source: CoachTextClueSource
  rule: Extract<VariantRule, { type: 'neighbor-match' }>
  artwork: readonly AuthoredMark[]
  title: string
} | undefined> {
  if (!Array.isArray(data.givenConstraints) || data.givenConstraints.length < 2) return
  const base = { ...data, givenConstraints: data.givenConstraints.slice(0, 2) }
  const hash = await sourceHash(code, base)
  if (!hash) return
  if (hash !== '2ee02d4f7c79da6f4a4497472c22e7bfde6b0064f7f8103728a0d6517b0e2cf5') return
  if (!data.givenConstraints.every(record)) return
  const constraints = data.givenConstraints
  const layers = constraints.filter(layer => layer.type === 'cosmeticText')
  if (layers.length !== 1) return
  const layer = layers[0]
  const settings = layer.settings
  if (!exactKeys(layer, ['id', 'type', 'segments', 'settings']) ||
    !record(settings) || !exactKeys(settings, ['gridResolution', 'positionVerticalOffset', 'colour', 'textSize']) ||
    settings.gridResolution !== 4 || settings.positionVerticalOffset !== 8 ||
    settings.colour !== '#ff8080' || settings.textSize !== 39 ||
    !Array.isArray(layer.segments) || layer.segments.length !== 17) return
  const clues: { point: Point; text: string }[] = []
  for (const segment of layer.segments) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      segment.cells.length !== 1 || !point(segment.cells[0]) || !record(segment.parameters) ||
      !exactKeys(segment.parameters, ['text']) || typeof segment.parameters.text !== 'string' ||
      !/^[1-9]$/.test(segment.parameters.text)) return
    clues.push({ point: segment.cells[0], text: segment.parameters.text })
  }
  const otherRules = constraints.filter(layer => layer !== layers[0])
  if (otherRules[0]?.type !== 'entropicLine') return
  const rule: Extract<VariantRule, { type: 'neighbor-match' }> = {
    type: 'neighbor-match',
    clues: clues.map(({ point: [x, y], text }) => ({ cell: Math.floor(y) * 9 + Math.floor(x), digit: Number(text) })),
  }
  const artwork: AuthoredMark[] = clues.map(({ point: [x, y], text }) => ({
    type: 'text', center: [x, y], text, size: settings.textSize as number / 200,
    color: settings.colour as string, opacity: 255, outlineColor: settings.colour as string,
    outlineThickness: 0, offsetY: (settings.positionVerticalOffset as number) / 100,
  }))
  return {
    source: {
      givens: typeof data.givenDigits === 'string' ? data.givenDigits : '0'.repeat(81),
      settings: {
        gridResolution: 4, positionVerticalOffset: 8, colour: '#ff8080', textSize: 39,
      },
      clues,
      otherRules,
    },
    rule,
    artwork,
    title: 'Raumploximentroplaner',
  }
}
