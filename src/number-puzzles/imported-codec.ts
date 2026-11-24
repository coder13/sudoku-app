export function encodeImportedNumberPuzzle(prefix: 'f1' | 'c1', definition: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(definition))
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  const payload = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return `${prefix}.${payload}`
}

export function decodeImportedNumberPuzzle<T>(token: string, prefix: 'f1' | 'c1'): T | undefined {
  const match = new RegExp(`^${prefix}\\.([A-Za-z0-9_-]{1,12000})$`).exec(token)
  if (!match) return
  try {
    const binary = atob(match[1].replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T
  } catch { return }
}

export function isNumberPosition(value: unknown, size: number) {
  if (!value || typeof value !== 'object') return false
  const position = value as { values?: unknown; notes?: unknown }
  return Array.isArray(position.values) && position.values.length === size ** 2 &&
    position.values.every(digit => Number.isInteger(digit) && digit >= 0 && digit <= size) &&
    Array.isArray(position.notes) && position.notes.length === size ** 2 &&
    position.notes.every(mask => Number.isInteger(mask) && mask >= 0 && mask < 2 ** size)
}
