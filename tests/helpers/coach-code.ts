import { deflateSync } from 'node:zlib'

/** Build source-format test inputs independently of the app's decoder. */
export function coachCode(data: Record<string, unknown>) {
  const alphabet = '0123456789abcdefghijklmnopqrstuv'
  const bytes = deflateSync(JSON.stringify({ gridSize: 9, ...data }))
  const bits = Array.from(bytes, byte => byte.toString(2).padStart(8, '0')).join('')
  return 'SCv7_32_' + bits.match(/.{1,5}/g)!.map(chunk => alphabet[Number.parseInt(chunk.padEnd(5, '0'), 2)]).join('')
}
