import { deflateSync } from 'node:zlib'

/** Build source-format test inputs independently of the app's decoder. */
export function coachCode(data: Record<string, unknown>) {
  return 'SCv7_32_' + encodeCoach({ gridSize: 9, ...data })
}

export function coachWholeProgress(snapshots: readonly Record<string, unknown>[], visible: number) {
  return '32_' + encodeCoach({ i: visible, a: snapshots.map(puzzle => JSON.stringify({ version: 7, ...puzzle })), b: [] })
}

function encodeCoach(data: Record<string, unknown>) {
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  const bytes = deflateSync(JSON.stringify(data))
  const bits = Array.from(bytes, byte => byte.toString(2).padStart(8, '0')).join('')
  return bits.match(/.{1,5}/g)!.map(chunk => alphabet[Number.parseInt(chunk.padEnd(5, '0'), 2)]).join('')
}
