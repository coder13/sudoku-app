const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

type Triple = readonly [number, number, number]

function triplePermutations(): Triple[] {
  const result: Triple[] = []
  for (let first = 0; first < 3; first++) for (let second = 0; second < 3; second++) {
    if (second === first) continue
    for (let third = 0; third < 3; third++) {
      if (third !== first && third !== second) result.push([first, second, third])
    }
  }
  return result
}

const TRIPLES = triplePermutations()

function validLineOrders(): Uint8Array[] {
  const orders: Uint8Array[] = []
  for (const bands of TRIPLES) for (const first of TRIPLES) for (const second of TRIPLES) for (const third of TRIPLES) {
    const withinBands = [first, second, third]
    const order = new Uint8Array(9)
    for (let band = 0; band < 3; band++) for (let line = 0; line < 3; line++) {
      order[band * 3 + line] = bands[band] * 3 + withinBands[band][line]
    }
    orders.push(order)
  }
  return orders
}

const LINE_ORDERS = validLineOrders()

function normalizedDigits(givens: string): Uint8Array {
  const names = new Uint8Array(10)
  const result = new Uint8Array(81)
  let nextName = 1
  for (let cell = 0; cell < 81; cell++) {
    const digit = givens.charCodeAt(cell) - 48
    if (digit) result[cell] = names[digit] || (names[digit] = nextName++)
  }
  return result
}

/** Return the least grid among all classic Sudoku position and digit symmetries. */
export function canonicalClassicPuzzle(givens: string): string {
  if (!/^[0-9]{81}$/.test(givens)) throw new Error('A classic Sudoku puzzle must contain 81 digits.')

  let clues = 0
  for (let cell = 0; cell < 81; cell++) if (givens.charCodeAt(cell) !== 48) clues++
  if (clues === 0) return '0'.repeat(81)
  if (clues === 1) return '0'.repeat(80) + '1'

  let best = normalizedDigits(givens)
  const candidate = new Uint8Array(81)
  const digitNames = new Uint8Array(10)

  for (let transpose = 0; transpose < 2; transpose++) {
    for (const rows of LINE_ORDERS) for (const columns of LINE_ORDERS) {
      digitNames.fill(0)
      let nextName = 1
      let index = 0
      let less = false
      let rejected = false

      for (let row = 0; row < 9 && !rejected; row++) for (let column = 0; column < 9; column++) {
        const sourceRow = transpose ? columns[column] : rows[row]
        const sourceColumn = transpose ? rows[row] : columns[column]
        const source = givens.charCodeAt(sourceRow * 9 + sourceColumn) - 48
        const digit = source ? digitNames[source] || (digitNames[source] = nextName++) : 0

        if (!less) {
          if (digit > best[index]) { rejected = true; break }
          if (digit < best[index]) less = true
        }
        candidate[index++] = digit
      }

      if (!rejected && less) best = candidate.slice()
    }
  }

  return Array.from(best, digit => String.fromCharCode(48 + digit)).join('')
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    result += BASE64URL[first >> 2]
    result += BASE64URL[((first & 3) << 4) | (second >> 4)]
    if (index + 1 < bytes.length) result += BASE64URL[((second & 15) << 2) | (third >> 6)]
    if (index + 2 < bytes.length) result += BASE64URL[third & 63]
  }
  return result
}

function decodeBase64Url(encoded: string): Uint8Array | undefined {
  if (!encoded || encoded.length % 4 === 1) return
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const character of encoded) {
    const value = BASE64URL.indexOf(character)
    if (value < 0) return
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 255)
      buffer &= (1 << bits) - 1
    }
  }
  if (buffer !== 0) return
  const result = Uint8Array.from(bytes)
  return encodeBase64Url(result) === encoded ? result : undefined
}

/** Create a reversible, URL-safe name for a classic Sudoku equivalence class. */
export function classicPuzzleName(givens: string): string {
  const canonical = canonicalClassicPuzzle(givens)
  let clues = 0
  for (let cell = 0; cell < 81; cell++) if (canonical.charCodeAt(cell) !== 48) clues++

  const bitLength = 81 + clues * 4
  const bytes = new Uint8Array(Math.ceil(bitLength / 8))
  let bit = 0
  const writeBit = (value: number) => {
    if (value) bytes[bit >> 3] |= 1 << (7 - (bit & 7))
    bit++
  }

  for (let cell = 0; cell < 81; cell++) writeBit(canonical.charCodeAt(cell) !== 48 ? 1 : 0)
  for (let cell = 0; cell < 81; cell++) {
    const digit = canonical.charCodeAt(cell) - 48
    if (!digit) continue
    for (let shift = 3; shift >= 0; shift--) writeBit((digit >> shift) & 1)
  }
  return `s1${encodeBase64Url(bytes)}`
}

/** Decode a name and reject valid-looking strings that do not use canonical form. */
export function puzzleFromName(name: string): string {
  if (!name.startsWith('s1')) throw new Error('This puzzle name is not supported.')
  if (name.length > 80) throw new Error('This puzzle name is invalid.')
  const bytes = decodeBase64Url(name.slice(2))
  if (!bytes) throw new Error('This puzzle name is invalid.')

  let bit = 0
  const readBit = () => {
    const value = (bytes[bit >> 3] >> (7 - (bit & 7))) & 1
    bit++
    return value
  }
  const mask = new Uint8Array(81)
  let clues = 0
  for (let cell = 0; cell < 81; cell++) {
    mask[cell] = readBit()
    clues += mask[cell]
  }
  const bitLength = 81 + clues * 4
  if (bytes.length !== Math.ceil(bitLength / 8)) throw new Error('This puzzle name is invalid.')

  const givens = Array<string>(81).fill('0')
  for (let cell = 0; cell < 81; cell++) {
    if (!mask[cell]) continue
    let digit = 0
    for (let part = 0; part < 4; part++) digit = (digit << 1) | readBit()
    if (digit < 1 || digit > 9) throw new Error('This puzzle name is invalid.')
    givens[cell] = String(digit)
  }
  while (bit < bytes.length * 8) if (readBit()) throw new Error('This puzzle name is invalid.')

  const puzzle = givens.join('')
  if (canonicalClassicPuzzle(puzzle) !== puzzle) throw new Error('This puzzle name is not canonical.')
  return puzzle
}
