type RecordValue = Record<string, unknown>

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Parse the compact SCL value grammar without evaluating puzzle content. */
export function parseCompactSudokuPad(text: string): unknown {
  let offset = 0
  const tokenPattern = /[^\s{}\[\]:,'"]+/y
  const keyPattern = /[a-zA-Z][a-zA-Z0-9_]*/y
  const malformed = (): never => { throw new Error('Invalid compact SudokuPad data.') }
  function peek() {
    while (offset < text.length && /\s/.test(text[offset])) offset++
    return text[offset]
  }
  function expect(char: string) {
    if (peek() !== char) malformed()
    offset++
  }
  function lex(pattern: RegExp) {
    peek()
    pattern.lastIndex = offset
    const match = pattern.exec(text)
    if (!match) return malformed()
    offset = pattern.lastIndex
    return match[0]
  }
  function quoted() {
    const quote = text[offset++]
    let result = ''
    while (offset < text.length) {
      const char = text[offset++]
      if (char === quote) return result
      if (char !== '\\') {
        if (char.charCodeAt(0) < 32) return malformed()
        result += char
        continue
      }
      const escape = text[offset++]
      if (escape === 'u') {
        const hex = text.slice(offset, offset + 4)
        if (!/^[0-9a-f]{4}$/i.test(hex)) return malformed()
        result += String.fromCharCode(parseInt(hex, 16))
        offset += 4
      } else {
        const escapes: Record<string, string> = { "'": "'", '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
        if (!Object.hasOwn(escapes, escape)) return malformed()
        result += escapes[escape]
      }
    }
    return malformed()
  }
  function read(depth: number, key?: string): unknown {
    if (depth > 32) return malformed()
    const char = peek()
    if (char === '{') {
      offset++
      const result: RecordValue = Object.create(null)
      if (peek() !== '}') while (true) {
        const field = peek() === '"' || peek() === "'" ? quoted() : lex(keyPattern)
        if (Object.hasOwn(result, field)) return malformed()
        expect(':')
        result[field] = read(depth + 1, field)
        if (peek() === '}') break
        expect(',')
      }
      expect('}')
      return result
    }
    if (char === '[') {
      offset++
      const result: unknown[] = []
      if (peek() !== ']') while (true) {
        // Empty objects are elided by the compact encoder, including at the end of a row.
        result.push(peek() === ',' || peek() === ']' ? {} : read(depth + 1))
        if (peek() === ']') break
        expect(',')
      }
      expect(']')
      return result
    }
    if (char === "'" || char === '"') return quoted()
    const token = lex(tokenPattern)
    if (token === 't' || token === 'true') return true
    if (token === 'f' || token === 'false') return false
    if (token === 'null') return null
    if (key === 'c' || key === 'c1' || key === 'c2') {
      if (token === '#0') return '#000000'
      if (token === '#F') return '#ffffff'
      if (/^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(token)) return token.startsWith('#') ? token : '#' + token
    }
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token) && Number.isFinite(Number(token))) return Number(token)
    return malformed()
  }
  const result = read(0)
  if (peek() !== undefined) return malformed()
  return result
}

function expand(value: unknown, aliases: Record<string, string>): unknown {
  if (!record(value)) return value
  const result: RecordValue = Object.create(null)
  for (const [key, contents] of Object.entries(value)) {
    const field = Object.hasOwn(aliases, key) ? aliases[key] : key
    if (Object.hasOwn(result, field)) throw new Error('Duplicate SudokuPad fields.')
    result[field] = contents
  }
  return { ...result }
}

export function normalizeCompactSudokuPad(value: unknown): unknown {
  if (!record(value) || !Object.hasOwn(value, 'ce')) return value
  const data = expand(value, { ce: 'cells', re: 'regions', ca: 'cages', l: 'lines', u: 'underlays', o: 'overlays' }) as RecordValue
  if (typeof data.cs === 'number' && Number.isFinite(data.cs) && data.cs > 0) delete data.cs
  if (Array.isArray(data.cells)) data.cells = data.cells.map(row => Array.isArray(row) ? row.map(cell => expand(cell, { v: 'value' })) : row)
  if (Array.isArray(data.cages)) {
    if (Object.hasOwn(data, 'metadata')) throw new Error('Duplicate SudokuPad metadata.')
    const metadata: RecordValue = Object.create(null)
    data.cages = data.cages.map(cage => expand(cage, { ce: 'cells', v: 'value' })).filter(cage => {
      if (!record(cage) || Object.keys(cage).length !== 1 || typeof cage.value !== 'string') return true
      const match = /^(title|author|rules|solution|source): ([\s\S]*)$/.exec(cage.value)
      if (!match) return true
      if (Object.hasOwn(metadata, match[1])) throw new Error('Duplicate SudokuPad metadata.')
      metadata[match[1]] = match[2]
      return false
    })
    data.metadata = { ...metadata }
  }
  if (Array.isArray(data.lines)) data.lines = data.lines.map(line => expand(line, { wp: 'wayPoints', c: 'color', th: 'thickness' }))
  for (const layer of ['underlays', 'overlays']) {
    const entries = data[layer]
    if (Array.isArray(entries)) data[layer] = entries.map(entry => expand(entry, {
      ct: 'center', w: 'width', h: 'height', r: 'rounded', te: 'text', c: 'color',
      c1: 'borderColor', c2: 'backgroundColor', th: 'thickness',
    }))
  }
  return data
}
