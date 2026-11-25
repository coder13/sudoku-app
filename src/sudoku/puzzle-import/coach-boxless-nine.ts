import type { AuthoredMark } from '../authored-artwork.ts'
import { record } from './shared.ts'

const reviewedExport = '421cc5cddbddfac039e2c1761f09a71af89f5837c8512653091639712a579070'

export type ReviewedCoachBoxlessNine = {
  unnumberedCages: readonly (readonly number[])[]
  artwork: readonly AuthoredMark[]
}

/** Read only the source-confirmed unnumbered cages and divider artwork. */
export async function readReviewedCoachBoxlessNine(
  code: string,
  data: Record<string, unknown>,
): Promise<ReviewedCoachBoxlessNine | undefined> {
  if (!globalThis.crypto?.subtle) return
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== reviewedExport || data.gridSize !== 9 || !Array.isArray(data.regions) || data.regions.length !== 0 ||
    data.givenDigits !== undefined && data.givenDigits !== '0'.repeat(81) || !Array.isArray(data.givenConstraints)) return

  const layers = data.givenConstraints
  const expectedTypes = ['cosmeticLine', 'antiKnight', 'cage', 'ratio', 'entropicLine', 'cage', 'whisper', 'quadruple']
  if (layers.length !== expectedTypes.length || layers.some((layer, index) => !record(layer) || layer.type !== expectedTypes[index])) return
  const [line, antiKnight, firstCages, ratio, entropic, numberedCages, whisper, quadruple] = layers
  if (!record(line) || !record(line.settings) || line.type !== 'cosmeticLine' ||
    JSON.stringify(line.settings) !== JSON.stringify({
      colour: '#ffa8a8', borderColour: '#a35c5c', gridSnapToCentres: false, gridSnapToCorners: true,
    }) || !Array.isArray(line.segments) || line.segments.length !== 3 ||
    !record(antiKnight) || !Array.isArray(antiKnight.segments) || antiKnight.segments.length !== 0 ||
    !record(firstCages) || !Array.isArray(firstCages.segments) || firstCages.segments.length !== 3 ||
    !record(ratio) || !Array.isArray(ratio.segments) || ratio.segments.length !== 4 ||
    !record(entropic) || !Array.isArray(entropic.segments) || entropic.segments.length !== 2 ||
    !record(numberedCages) || !Array.isArray(numberedCages.segments) || numberedCages.segments.length !== 4 ||
    !record(whisper) || !Array.isArray(whisper.segments) || whisper.segments.length !== 6 ||
    !record(quadruple) || !Array.isArray(quadruple.segments) || quadruple.segments.length !== 5) return

  const artwork: AuthoredMark[] = []
  for (const segment of line.segments) {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length < 2 ||
      !segment.cells.every(point => Array.isArray(point) && point.length === 2 &&
        point.every(value => Number.isInteger(value) && value >= 0 && value <= 9)) ||
      !record(segment.parameters) || Object.keys(segment.parameters).length !== 0) return
    const points = segment.cells as [number, number][]
    if (points.slice(1).some(([x, y], index) =>
      (x === points[index][0]) === (y === points[index][1]))) return
    artwork.push({ type: 'divider', points, thickness: .03 })
  }

  const unnumberedCages: number[][] = []
  for (const segment of firstCages.segments) {
    if (!record(segment) || !Array.isArray(segment.cells) || segment.cells.length !== 9 ||
      !segment.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81) ||
      new Set(segment.cells).size !== 9 || !record(segment.parameters) || Object.keys(segment.parameters).length) return
    unnumberedCages.push([...segment.cells] as number[])
  }
  for (const segment of numberedCages.segments) {
    if (!record(segment) || !Array.isArray(segment.cells) || !segment.cells.length ||
      !record(segment.parameters) || Object.keys(segment.parameters).length !== 1 ||
      !Number.isInteger(segment.parameters.sum) || Number(segment.parameters.sum) < 1 ||
      Number(segment.parameters.sum) > 45) return
  }
  return { unnumberedCages, artwork }
}
