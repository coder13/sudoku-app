const base = '/api/v1/'
const secretPattern = /^[a-f0-9]{64}$/
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/
const maxBytes = 1536 * 1024
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
const secret = () => hex(crypto.getRandomValues(new Uint8Array(32)))
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function input(request, limit = 2048) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.')
  if (+request.headers.get('Content-Length') > limit) throw new HttpError(413, 'Save is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'Missing request body.')
  const decoder = new TextDecoder()
  let size = 0, content = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Save is too large.') }
    content += decoder.decode(value, { stream: true })
  }
  try {
    const result = JSON.parse(content + decoder.decode())
    if (result && typeof result === 'object' && !Array.isArray(result)) return result
  } catch { /* Report malformed input consistently. */ }
  throw new HttpError(400, 'Invalid request.')
}

async function api(request, db, url) {
  const path = url.pathname.slice(base.length)
  const method = request.method
  if (path === 'health') {
    if (method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    return (await db.prepare('SELECT 1 AS ok').first('ok')) === 1 ? json({ ok: true }) : json({ ok: false }, 503)
  }
  if (method !== 'GET' && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) {
    throw new HttpError(403, 'Unexpected request origin.')
  }
  if (method === 'POST' && ['libraries', 'join', 'recover'].includes(path)) {
    const data = await input(request)
    const name = typeof data.name === 'string' && data.name.trim().slice(0, 60)
    if (!name) throw new HttpError(400, 'Give this device a name.')
    const id = crypto.randomUUID(), token = secret(), tokenHash = await digest(token), now = Date.now()
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
    return json({ id, token }, 201)
  }
  if (!/^(invitations|devices(?:\/[\w-]+)?|changes|puzzles\/[\w-]+)$/.test(path)) throw new HttpError(404, 'Not found.')
  const raw = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  const device = raw && await db.prepare('SELECT id, library FROM devices WHERE token_hash = ?').bind(await digest(raw)).first()
  if (!device) throw new HttpError(401, 'This device is no longer linked.')
  const { library } = device
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
  if (path.startsWith('devices/') && method === 'DELETE') {
    await db.prepare('DELETE FROM devices WHERE library = ? AND id = ?').bind(library, path.slice(8)).run()
    return json({ ok: true })
  }
  if (path === 'changes' && method === 'GET') {
    const after = Number(url.searchParams.get('after') ?? 0)
    if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, 'Invalid cursor.')
    return json((await db.prepare('SELECT id, revision, sequence FROM puzzles WHERE library = ? AND sequence > ? ORDER BY sequence LIMIT 100')
      .bind(library, after).all()).results)
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
      return json({ revision: revision + 1 })
    }
  }
  throw new HttpError(405, 'Method not allowed.')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!url.pathname.startsWith(base)) return json({ error: 'Not found.' }, 404)
    try { return await api(request, env.DB, url) }
    catch (error) {
      return error instanceof HttpError ? json({ error: error.message }, error.status)
        : json(url.pathname === base + 'health' ? { ok: false } : { error: 'Sync service unavailable.' }, 503)
    }
  },
}
