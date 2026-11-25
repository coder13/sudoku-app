export type CoachEntropyGroup = 'low' | 'middle' | 'high'
export type CoachEntropyGroupOrder = {
  side: 'top' | 'right' | 'bottom' | 'left'
  index: number
  group: CoachEntropyGroup
  digits: readonly [number, number, number]
  cells: readonly number[]
}

export type CoachEntropyGroupOrderSource = {
  givens: string
  orders: readonly CoachEntropyGroupOrder[]
  otherRules: readonly unknown[]
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}

const reviewedExport = 'a53d999916a980c445143564ea4188bdbf35f7df545bf2d946b4e307dedd15ba'

/** Decode the seven authored outside group-order clues from the reviewed 7nms export. */
export async function readReviewedCoachEntropyGroupOrder(code: string, data: Record<string, unknown>): Promise<{
  source: CoachEntropyGroupOrderSource
} | undefined> {
  if (!globalThis.crypto?.subtle) return
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== reviewedExport || data.gridSize !== 9 || !Array.isArray(data.givenConstraints) ||
    !data.givenConstraints.every(record)) return

  const layers = data.givenConstraints
  const textLayers = layers.filter(layer => layer.type === 'cosmeticText')
  if (textLayers.length !== 1) return
  const [textLayer] = textLayers
  if (!exactKeys(textLayer, ['id', 'type', 'segments', 'settings']) || !record(textLayer.settings) ||
    !exactKeys(textLayer.settings, ['gridZoomOut', 'textSize']) || textLayer.settings.gridZoomOut !== 1 ||
    textLayer.settings.textSize !== 60 || !Array.isArray(textLayer.segments) || textLayer.segments.length !== 7) return

  const orders: CoachEntropyGroupOrder[] = []
  const seen = new Set<string>()
  for (const segment of textLayer.segments) {
    if (!record(segment) || !exactKeys(segment, ['cells', 'parameters']) || !Array.isArray(segment.cells) ||
      segment.cells.length !== 1 || !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
      !segment.cells[0].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      !record(segment.parameters) || !exactKeys(segment.parameters, ['text']) || typeof segment.parameters.text !== 'string') return
    const [x, y] = segment.cells[0] as [number, number]
    const group = ({ L: 'low', M: 'middle', H: 'high' } as const)[segment.parameters.text as 'L' | 'M' | 'H']
    if (!group) return
    let side: CoachEntropyGroupOrder['side'], index: number, cells: number[]
    if (y === -0.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= 8.5) {
      side = 'top'; index = x - 0.5; cells = Array.from({ length: 9 }, (_, row) => row * 9 + index)
    } else if (y === 9.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= 8.5) {
      side = 'bottom'; index = x - 0.5; cells = Array.from({ length: 9 }, (_, offset) => (8 - offset) * 9 + index)
    } else if (x === -0.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= 8.5) {
      side = 'left'; index = y - 0.5; cells = Array.from({ length: 9 }, (_, column) => index * 9 + column)
    } else if (x === 9.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= 8.5) {
      side = 'right'; index = y - 0.5; cells = Array.from({ length: 9 }, (_, offset) => index * 9 + 8 - offset)
    } else return
    const key = `${side}:${index}`
    if (seen.has(key)) return
    seen.add(key)
    const digits = group === 'low' ? [1, 2, 3] as const : group === 'middle' ? [4, 5, 6] as const : [7, 8, 9] as const
    orders.push({ side, index, group, digits, cells })
  }
  const counts = { low: 0, middle: 0, high: 0 }
  for (const order of orders) counts[order.group]++
  if (counts.low !== 2 || counts.middle !== 2 || counts.high !== 3) return

  return {
    source: {
      givens: typeof data.givenDigits === 'string' && /^[0-9]{81}$/.test(data.givenDigits) ? data.givenDigits : '0'.repeat(81),
      orders,
      otherRules: layers.filter(layer => layer !== textLayer),
    },
  }
}
