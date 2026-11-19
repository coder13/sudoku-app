const base = '/api/v1/'
const secretPattern = /^[a-f0-9]{64}$/
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/
const shareIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const maxBytes = 1536 * 1024
const maxDefinitionBytes = 256 * 1024
function deviceName(id, name = '') {
  if (typeof name !== 'string') throw new HttpError(400, 'Invalid device name.')
  return name.trim().slice(0, 60) || 'Device ' + id.slice(0, 6).toUpperCase()
}
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
const secret = () => hex(crypto.getRandomValues(new Uint8Array(32)))
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function input(request, limit = 2048, tooLarge = 'Save is too large.') {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.')
  if (+request.headers.get('Content-Length') > limit) throw new HttpError(413, tooLarge)
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'Missing request body.')
  const decoder = new TextDecoder()
  let size = 0, content = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { await reader.cancel(); throw new HttpError(413, tooLarge) }
    content += decoder.decode(value, { stream: true })
  }
  try {
    const result = JSON.parse(content + decoder.decode())
    if (result && typeof result === 'object' && !Array.isArray(result)) return result
  } catch { /* Report malformed input consistently. */ }
  throw new HttpError(400, 'Invalid request.')
}

const maximumPuzzleCodeLength = 20_000
const publicPuzzleSources = {
  'sudoku-coach': {
    pattern: /^[A-Za-z0-9]{1,16}$/,
    url: id => `https://sudoku.coach/en/s/${id}`,
    maxBytes: 512 * 1024,
    code(text) {
      const codes = new Set(text.match(/\bSCv7_32_[0-9a-v]+\b/gi) ?? [])
      return codes.size === 1 ? codes.values().next().value : undefined
    },
  },
  sudokupad: {
    pattern: /^[A-Za-z0-9_-]{1,64}$/,
    url: id => `https://sudokupad.app/api/puzzle/${id}`,
    maxBytes: 20_024,
    code(text) {
      const value = text.trim()
      return /^(?:scl|ctc|fpuzzles|fpuz|scf)[A-Za-z0-9+/=_-]+$/i.test(value) ? value : undefined
    },
  },
}

async function loadPublicPuzzle(request, path) {
  const [, provider, id] = path.split('/')
  const source = Object.hasOwn(publicPuzzleSources, provider) ? publicPuzzleSources[provider] : undefined
  if (!source || !source.pattern.test(id ?? '') || path !== `import/${provider}/${id}`) {
    throw new HttpError(404, 'Unknown puzzle link.')
  }
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.')
  let response
  try {
    response = await fetch(source.url(id), { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
  } catch {
    throw new HttpError(502, 'Could not open the published puzzle.')
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    throw new HttpError(502, 'The puzzle source redirected to another location.')
  }
  if (response.status === 404) throw new HttpError(404, 'The published puzzle could not be found.')
  if (!response.ok || !response.body) throw new HttpError(502, 'The puzzle source is unavailable.')

  if (+response.headers.get('Content-Length') > source.maxBytes) {
    await response.body.cancel()
    throw new HttpError(413, 'The puzzle source is too large.')
  }
  const decoder = new TextDecoder()
  let content = '', bytes = 0
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength
      if (bytes > source.maxBytes) throw new HttpError(413, 'The puzzle source is too large.')
      content += decoder.decode(chunk, { stream: true })
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'The puzzle source is unavailable.')
  }
  const code = source.code(content + decoder.decode())
  if (!code || code.length > maximumPuzzleCodeLength) {
    throw new HttpError(422, 'This link does not contain a supported puzzle export.')
  }
  return json({ code })
}

// The public API accepts a versioned puzzle definition. Check each nested field
// so private solve data cannot be stored inside the variant or collection object.
function fields(value, required, optional = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(required).every(([key, valid]) => Object.hasOwn(value, key) && valid(value[key])) &&
    Object.keys(value).every(key => Object.hasOwn(required, key) || Object.hasOwn(optional, key) && optional[key](value[key]))
}

const integer = (min, max) => value => Number.isInteger(value) && value >= min && value <= max
const list = (valid, min, max = Infinity) => value => Array.isArray(value) && value.length >= min && value.length <= max && value.every(valid)
const givens = (value, size = 9) => typeof value === 'string' && (size === 4 ? /^[0-4]{16}$/ : size === 6 ? /^[0-6]{36}$/ : /^[0-9]{81}$/).test(value)
const boolean = value => typeof value === 'boolean'
const oneOf = (...choices) => value => choices.includes(value)
const miniGrid = value => fields(value, { size: oneOf(4), boxRows: oneOf(2), boxColumns: oneOf(2) })
const sixGrid = value => fields(value, { size: oneOf(6), boxRows: oneOf(2), boxColumns: oneOf(3) }) ||
  fields(value, { size: oneOf(6), boxRows: oneOf(3), boxColumns: oneOf(2) })
const sixCell = integer(0, 35)
const sixRenban = value =>
  fields(value, { type: oneOf('renban'), cells: list(sixCell, 1, 6) }, { segments: list(list(sixCell, 1, 128), 1, 128) }) &&
  new Set(value.cells).size === value.cells.length &&
  (value.segments === undefined || new Set(value.segments.flat()).size === value.cells.length &&
    value.segments.every(part => part.every(cell => value.cells.includes(cell))))
const sixRule = value => sixRenban(value) || fields(value, { type: oneOf('diagonal'), diagonal: oneOf('main', 'anti') }) ||
  fields(value, { type: oneOf('parity'), parity: oneOf('odd', 'even'), cells: list(integer(0, 35), 1, 36) }) ||
  (fields(value, { type: oneOf('thermometer'), cells: list(integer(0, 35), 2, 6) }) && new Set(value.cells).size === value.cells.length)
const sixRules = list(sixRule, 0, 128)
const algebraicCage = value => {
  if (!fields(value, { type: oneOf('algebraic-cage'), cells: list(integer(0, 15), 1, 4), label: label => typeof label === 'string',
    total: total => fields(total, { type: oneOf('fixed'), value: integer(1, 10) }) ||
      fields(total, { type: oneOf('variable'), name: name => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name),
        offset: integer(-2147483648, 2147483647) }) })) return false
  const { total } = value
  const label = total.type === 'fixed' ? String(total.value)
    : total.name + (total.offset ? `${total.offset > 0 ? '+' : ''}${total.offset}` : '')
  return value.label === label
}
const algebraic = value => fields(value, { sudokuPad: code => typeof code === 'string' && code.length <= 10_000 && /^(?:scl|ctc)[A-Za-z0-9+/=]+$/i.test(code) }) ||
  (fields(value, { rules: list(algebraicCage, 1, 16) }) &&
    value.rules.some(rule => rule.total.type === 'variable') &&
    new Set(value.rules.flatMap(rule => rule.cells)).size === value.rules.reduce((count, rule) => count + rule.cells.length, 0))
const cell = integer(0, 80)
const cells = list(cell, 1, 81)
const pairs = list(list(cell, 2, 2), 0)
const house = list(cell, 9, 9)
const direction = oneOf('north', 'east', 'south', 'west')
const marks = value => fields(value, {}, { pairs, negative: boolean })
const regions = value => fields(value, { type: oneOf('boxes') }) ||
  fields(value, { type: oneOf('jigsaw'), regions: list(house, 9, 9) })
const segments = list(list(cell, 1), 1)
const diagonalDirection = oneOf('north-east', 'south-east', 'south-west', 'north-west')
const ruleFields = {
  'adjacent-total': [{ cells: list(cell, 2, 2), sum: integer(3, 17) }],
  between: [{ cells: list(cell, 3, 81) }],
  clone: [{ groups: list(list(cell, 2, 81), 1) }],
  entropic: [{ cells: list(cell, 1) }],
  'global-entropy': [{}],
  inequality: [{ less: cell, greater: cell }],
  'little-killer': [{ direction: diagonalDirection, cells: list(cell, 1, 9), sum: integer(1, 81) }],
  modular: [{ cells: list(cell, 1) }],
  palindrome: [{ cells }, { segments }],
  'region-sum': [{ cells }, { groupByRegion: boolean, segments }],
  renban: [{ cells: list(cell, 1, 9) }, { segments }],
  whispers: [{ cells: list(cell, 2, 82), minDifference: integer(1, 8) }],
  'x-sum': [{ direction, cells: house, sum: integer(1, 45) }],
  xv: [{}, { five: marks, ten: marks }],
  'anti-king': [{}],
  'anti-knight': [{}],
  arrow: [{ circle: cell, cells }],
  diagonal: [{ diagonal: oneOf('main', 'anti') }],
  'extra-house': [{ cells: house }],
  'killer-cages': [{ cages: list(value => fields(value, { cells, sum: integer(1, 45) }), 1) }, { coverGrid: boolean }],
  kropki: [{}, { consecutive: marks, ratioTwo: marks }],
  'non-consecutive': [{}, { except: pairs }],
  parity: [{ cells, parity: oneOf('odd', 'even') }],
  quadruple: [{ topLeft: cell, digits: list(integer(1, 9), 1, 4) }],
  sandwich: [{ direction, cells: house, sum: integer(0, 35) }],
  skyscrapers: [{ direction, cells: house, count: integer(1, 9) }],
  thermometer: [{ cells: list(cell, 2, 81) }],
}
const rule = value => {
  if (typeof value?.type !== 'string' || !Object.hasOwn(ruleFields, value.type)) return false
  const [required, optional] = ruleFields[value.type]
  return fields(value, { type: oneOf(value.type), ...required }, optional)
}
const variant = (value, grid) => fields(value, {
  id: id => typeof id === 'string' && (['jigsaw', 'windoku', 'mixed'].includes(id) || Object.hasOwn(ruleFields, id)),
  puzzle: puzzle => fields(puzzle, { version: oneOf(1), givens: oneOf(grid) }, { regions, rules: list(rule, 0) }),
})
const collection = value => fields(value, {
  collectionId: id => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id),
  puzzleId: id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id),
})

function canonicalDefinition(data) {
  return JSON.stringify(data, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)
}

async function sharePuzzle(request, db, path) {
  if (path === 'shares' && request.method === 'POST') {
    const data = await input(request, maxDefinitionBytes, 'This puzzle definition is too large to share.')
    if (!fields(data, {
      version: oneOf(1), title: title => typeof title === 'string' && title.trim().length > 0 && title.length <= 72,
      givens: value => givens(value, data.grid?.size),
    }, { grid: value => miniGrid(value) || sixGrid(value), algebraic: value => data.grid?.size === 4 && algebraic(value),
      sixRules: value => data.grid?.size === 6 && sixRules(value),
      sixAuthor: value => data.grid?.size === 6 && typeof value === 'string' && value.trim().length > 0 && value.length <= 72,
      variant: value => data.grid === undefined && variant(value, data.givens), collection }) ||
      (data.grid?.size === 6 && !Object.hasOwn(data, 'sixRules'))) {
      throw new HttpError(400, 'Invalid puzzle definition.')
    }
    const id = crypto.randomUUID()
    const definition = canonicalDefinition({ ...data, title: data.title.trim() })
    const key = await digest(definition)
    const result = await db.prepare(`INSERT INTO shared_puzzles (id, fingerprint, definition) VALUES (?, ?, ?)
      ON CONFLICT(fingerprint) DO NOTHING`).bind(id, key, definition).run()
    if (result.meta.changes) return json({ id }, 201)
    const existing = await db.prepare('SELECT id FROM shared_puzzles WHERE fingerprint = ?').bind(key).first('id')
    return json({ id: existing })
  }
  if (path.startsWith('shares/') && request.method === 'GET') {
    const id = path.slice('shares/'.length)
    const definition = shareIdPattern.test(id) && await db.prepare('SELECT definition FROM shared_puzzles WHERE id = ?')
      .bind(id.toLowerCase()).first('definition')
    if (!definition) throw new HttpError(404, 'This puzzle link is unavailable.')
    return json(JSON.parse(definition))
  }
  throw new HttpError(405, 'Method not allowed.')
}

async function api(request, { DB: db, SYNC_EVENTS: events }, ctx, url) {
  function notify(library, message, device) {
    if (!events) return
    ctx.waitUntil(Promise.resolve().then(async () => {
      const id = typeof library === 'function' ? await library() : library
      if (id) await events.getByName(id).notify(message, device)
    }).catch(() => console.warn('Could not deliver a sync notification.')))
  }
  const path = url.pathname.slice(base.length)
  const method = request.method
  if (path.startsWith('import/')) return loadPublicPuzzle(request, path)
  if (path === 'health') {
    if (method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    return (await db.prepare('SELECT 1 AS ok').first('ok')) === 1 ? json({ ok: true }) : json({ ok: false }, 503)
  }
  if (method !== 'GET' && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) {
    throw new HttpError(403, 'Unexpected request origin.')
  }
  if (path === 'shares' || path.startsWith('shares/')) return sharePuzzle(request, db, path)
  if (method === 'POST' && ['libraries', 'join', 'recover'].includes(path)) {
    const data = path === 'libraries' && request.body === null ? {} : await input(request)
    const id = crypto.randomUUID(), token = secret(), tokenHash = await digest(token), now = Date.now()
    const name = deviceName(id, data.name)
    const insert = 'INSERT INTO devices(id, token_hash, name, created, library) '
    if (path === 'libraries') {
      const library = crypto.randomUUID(), recovery = secret()
      await db.batch([
        db.prepare('INSERT INTO libraries(id, recovery_hash) VALUES (?, ?)').bind(library, await digest(recovery)),
        db.prepare(insert + 'VALUES (?, ?, ?, ?, ?)').bind(id, tokenHash, name, now, library),
      ])
      return json({ id, token, recovery }, 201)
    }
    if (!secretPattern.test(data.secret ?? '')) throw new HttpError(400, 'Invalid link or recovery key.')
    const key = await digest(data.secret)
    let result
    if (path === 'join') {
      const [enrollment] = await db.batch([
        db.prepare(insert + 'SELECT ?, ?, ?, ?, library FROM invitations WHERE ticket_hash = ? AND expires > ?')
          .bind(id, tokenHash, name, now, key, now),
        db.prepare('DELETE FROM invitations WHERE ticket_hash = ?').bind(key),
      ])
      result = enrollment
    } else {
      result = await db.prepare(insert + 'SELECT ?, ?, ?, ?, id FROM libraries WHERE recovery_hash = ?')
        .bind(id, tokenHash, name, now, key).run()
    }
    if (!result.meta.changes) throw new HttpError(403, 'The link or recovery key is invalid or expired.')
    notify(() => db.prepare('SELECT library FROM devices WHERE id = ?').bind(id).first('library'), 'devices')
    return json({ id, token }, 201)
  }
  const upgrade = path === 'live'
  if (!upgrade && !/^(invitations|devices(?:\/[\w-]+)?|settings|changes|puzzles\/[\w-]+)$/.test(path)) throw new HttpError(404, 'Not found.')
  let raw = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  let wantsPresence = false
  if (upgrade) {
    if (!events) throw new HttpError(503, 'Live sync is unavailable.')
    if (method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new HttpError(426, 'Expected a WebSocket upgrade.')
    }
    if (request.headers.get('Origin') !== url.origin) throw new HttpError(403, 'Unexpected request origin.')
    // Browsers cannot set Authorization on a WebSocket. Use the unselected
    // subprotocol for the token so it stays out of request URLs and responses.
    const [protocol, token, feature] = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(value => value.trim())
    raw = protocol === 'sudoku-sync' && secretPattern.test(token ?? '') ? token : undefined
    wantsPresence = feature === 'sudoku-sync-presence'
  }
  const includeSettings = path === 'changes' && url.searchParams.has('settings')
  const authQuery = includeSettings
    ? 'SELECT devices.id, library, settings FROM devices JOIN libraries ON libraries.id = devices.library WHERE token_hash = ?'
    : 'SELECT id, library FROM devices WHERE token_hash = ?'
  const device = raw && await db.prepare(authQuery).bind(await digest(raw)).first()
  if (!device) throw new HttpError(401, 'This device is no longer linked.')
  const { library } = device
  if (upgrade) {
    const headers = new Headers({ Upgrade: 'websocket', 'X-Sync-Device': device.id })
    if (wantsPresence) headers.set('X-Sync-Presence', '1')
    return events.getByName(library).fetch(new Request(request.url, {
      headers,
    }))
  }
  if (path === 'invitations' && method === 'POST') {
    const ticket = secret(), now = Date.now(), expires = now + 10 * 60_000
    await db.batch([
      db.prepare('DELETE FROM invitations WHERE expires <= ?').bind(now),
      db.prepare('INSERT INTO invitations(ticket_hash, issuer, library, expires) VALUES (?, ?, ?, ?)').bind(await digest(ticket), device.id, library, expires),
    ])
    return json({ ticket, expires }, 201)
  }
  if (path === 'devices' && method === 'GET') {
    return json((await db.prepare('SELECT id, name, created FROM devices WHERE library = ? ORDER BY created').bind(library).all()).results)
  }
  if (path.startsWith('devices/') && method === 'PATCH') {
    const id = path.slice('devices/'.length)
    const data = await input(request)
    if (!Object.hasOwn(data, 'name')) throw new HttpError(400, 'Missing device name.')
    const name = deviceName(id, data.name)
    const result = await db.prepare('UPDATE devices SET name = ? WHERE library = ? AND id = ?').bind(name, library, id).run()
    if (!result.meta.changes) throw new HttpError(404, 'Device not found.')
    notify(library, 'devices')
    return json({ name })
  }
  if (path.startsWith('devices/') && method === 'DELETE') {
    const id = path.slice(8)
    const result = await db.prepare('DELETE FROM devices WHERE library = ? AND id = ?').bind(library, id).run()
    if (result.meta.changes) notify(library, 'revoked', id)
    return json({ ok: true })
  }
  if (path === 'settings' && method === 'PATCH') {
    const { seeds, edits } = await input(request, 32 * 1024)
    for (const map of [seeds, edits]) {
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new HttpError(400, 'Invalid settings.')
      for (const [key, value] of Object.entries(map)) {
        if (!/^[a-z][a-zA-Z0-9.-]{0,79}$/.test(key) || typeof value !== 'string') throw new HttpError(400, 'Invalid setting.')
        try { JSON.parse(value) } catch { throw new HttpError(400, 'Invalid setting value.') }
      }
    }
    // Existing choices win over enrollment seeds. Later edits change only their individual fields.
    const update = 'json_patch(json_patch(?, settings), ?)'
    const result = await db.prepare('UPDATE libraries SET settings = ' + update +
      ' WHERE id = ? AND length(CAST(' + update + ' AS BLOB)) <= 65536 RETURNING settings')
      .bind(JSON.stringify(seeds), JSON.stringify(edits), library, JSON.stringify(seeds), JSON.stringify(edits)).first('settings')
    if (result == null) throw new HttpError(413, 'Settings are too large to sync.')
    notify(library, 'changes', device.id)
    return json(JSON.parse(result))
  }
  if (path === 'changes' && method === 'GET') {
    const after = Number(url.searchParams.get('after') ?? 0)
    if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, 'Invalid cursor.')
    const changes = (await db.prepare('SELECT id, revision, sequence FROM puzzles WHERE library = ? AND sequence > ? ORDER BY sequence LIMIT 100')
      .bind(library, after).all()).results
    return json(includeSettings ? { changes, settings: JSON.parse(device.settings) } : changes)
  }
  if (path.startsWith('puzzles/')) {
    const id = path.slice(8)
    if (!idPattern.test(id)) throw new HttpError(400, 'Invalid puzzle ID.')
    if (method === 'GET') {
      const row = await db.prepare('SELECT revision, hash, played, elapsed, body FROM puzzles WHERE library = ? AND id = ?').bind(library, id).first()
      return row ? json({ ...row, game: row.body && JSON.parse(row.body), body: undefined }) : json({ error: 'Unknown puzzle.' }, 404)
    }
    if (method === 'PUT') {
      const { revision, hash, played, game } = await input(request, maxBytes)
      if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(played) || played < 0 ||
        (game === null ? hash !== 'deleted' : !secretPattern.test(hash) || game?.id !== id ||
          !Number.isSafeInteger(game.elapsed) || game.elapsed < 0 || typeof game.title !== 'string' || !game.position)) {
        throw new HttpError(400, 'Invalid puzzle save.')
      }
      if (game) {
        const { elapsed, savedForLater, ...content } = game
        if (await digest(JSON.stringify(content)) !== hash) throw new HttpError(400, 'Puzzle fingerprint does not match the save.')
      }
      const body = game === null ? null : JSON.stringify(game)
      const sequence = '(SELECT COALESCE(MAX(sequence), 0) + 1 FROM puzzles WHERE library = ?)'
      // Both the revision check and sequence allocation happen in one SQLite statement.
      const result = revision === 0
        ? await db.prepare('INSERT INTO puzzles(library,id,revision,sequence,hash,played,elapsed,body) VALUES (?,?,1,' + sequence + ',?,?,?,?) ON CONFLICT(library,id) DO NOTHING')
          .bind(library, id, library, hash, played, game?.elapsed ?? 0, body).run()
        : await db.prepare('UPDATE puzzles SET revision = revision + 1, sequence = ' + sequence + ', hash = ?, played = ?, elapsed = ?, body = ? WHERE library = ? AND id = ? AND revision = ? AND body IS NOT NULL')
          .bind(library, hash, played, game?.elapsed ?? 0, body, library, id, revision).run()
      if (!result.meta.changes) throw new HttpError(409, 'Puzzle changed on another device.')
      notify(library, 'changes', device.id)
      return json({ revision: revision + 1 })
    }
  }
  throw new HttpError(405, 'Method not allowed.')
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!url.pathname.startsWith(base)) return json({ error: 'Not found.' }, 404)
    try { return await api(request, env, ctx, url) }
    catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      if (url.pathname === base + 'health') return json({ ok: false }, 503)
      const service = url.pathname === base + 'shares' || url.pathname.startsWith(base + 'shares/') ? 'Sharing' : 'Sync'
      return json({ error: `${service} service unavailable.` }, 503)
    }
  },
}
