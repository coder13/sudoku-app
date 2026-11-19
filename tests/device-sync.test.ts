import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeGame, EMPTY, enter, isSolved, setGamePaused, undo, type Game } from '../src/sudoku/game.ts'
import { GAME_PREFIX } from '../src/sudoku/storage.ts'
import { recordAction } from '../src/sudoku/action-history.ts'
import { ratingAttemptFor } from '../src/sudoku/player-rating.ts'
import { activityPrefix, inProgress } from '../src/sudoku/puzzle-activity.ts'
import { readTiming, TIMING_KEY } from '../src/sudoku/puzzle-timing.ts'
import { createSyncEngine, syncRequest, type Credentials } from '../src/sudoku/sync-engine.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'
import { syncDatabase } from './helpers/sync-database.ts'

async function library() {
  const { sqlite, fetcher } = syncDatabase()
  const anon = syncRequest(undefined, fetcher)
  const creator = await anon<Credentials & { recovery: string }>('libraries', 'POST', { name: 'Phone' })
  const phone = syncRequest(creator.token, fetcher)
  const { ticket } = await phone<{ ticket: string }>('invitations', 'POST')
  const second = await anon<Credentials>('join', 'POST', { name: 'Computer', secret: ticket })
  const computer = syncRequest(second.token, fetcher)
  return { sqlite, fetcher, anon, creator, phone, second, computer, ticket }
}

function client(device: Credentials, api: ReturnType<typeof syncRequest>, storage = new MemoryStorage()) {
  const engine = createSyncEngine(storage, device.id, api, () => {})
  return { storage, run: engine.run,
    write: (game: Game) => storage.setItem(GAME_PREFIX + game.id, JSON.stringify(game)),
    read: (id: string): Game | null => JSON.parse(storage.getItem(GAME_PREFIX + id) ?? 'null'),
    remove: (id: string) => storage.removeItem(GAME_PREFIX + id),
    games: (): Game[] => Object.keys(storage).filter(key => key.startsWith(GAME_PREFIX)).map(key => JSON.parse(storage.getItem(key)!)),
  }
}

test('device credentials, one-use invitations, expiry, recovery, revocation and library isolation', async () => {
  const { sqlite, fetcher, anon, phone, second, computer, ticket, creator } = await library()
  try {
    await assert.rejects(anon('join', 'POST', { name: 'Third', secret: ticket }), { status: 403 })
    const next = await phone<{ ticket: string }>('invitations', 'POST')
    sqlite.exec('UPDATE invitations SET expires=0')
    await assert.rejects(anon('join', 'POST', { name: 'Expired', secret: next.ticket }), { status: 403 })
    const recovered = await anon<Credentials>('recover', 'POST', { name: 'Recovery', secret: creator.recovery })
    assert.notEqual(recovered.token, creator.token)
    assert.equal((await computer<unknown[]>('devices')).length, 3)
    const stranger = await anon<Credentials>('libraries', 'POST', { name: 'Other library' })
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM devices WHERE token_hash = ?').get(creator.token)?.n, 0)
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM libraries WHERE recovery_hash = ?').get(creator.recovery)?.n, 0)
    const foreign = syncRequest(stranger.token, fetcher)
    const first = client(creator, phone)
    first.write(makeGame('private', 'Private puzzle', EMPTY, 'custom'))
    await first.run()
    const restored = client(recovered, syncRequest(recovered.token, fetcher))
    await restored.run()
    assert.equal(restored.read('private')?.title, 'Private puzzle')
    assert.deepEqual(await foreign('changes'), [])
    await assert.rejects(foreign('puzzles/private'), { status: 404 })
    await foreign('devices/' + second.id, 'DELETE')
    assert.equal((await computer<unknown[]>('devices')).length, 3)
    await assert.rejects(anon('devices'), { status: 401 })
    const outstanding = await computer<{ ticket: string }>('invitations', 'POST')
    await phone('devices/' + second.id, 'DELETE')
    await assert.rejects(anon('join', 'POST', { name: 'Revoked link', secret: outstanding.ticket }), { status: 403 })
    await assert.rejects(computer('devices'), { status: 401 })
  } finally { sqlite.close() }
})

test('live sync upgrades only authenticated same-origin devices and signals committed changes', async () => {
  const upgrades: { library: string; request: Request }[] = []
  const events: { library: string; message: string; device?: string }[] = []
  const { sqlite, fetcher } = syncDatabase({
    getByName: library => ({
      fetch: request => { upgrades.push({ library, request }); return new Response(null, { status: 204 }) },
      notify: (message, device) => {
        if (message === 'changes') assert.equal(sqlite.prepare('SELECT count(*) AS n FROM puzzles WHERE library = ?').get(library)?.n, 1)
        events.push({ library, message, device })
      },
    }),
  })
  try {
    const create = syncRequest(undefined, fetcher)
    const first = await create<Credentials>('libraries', 'POST', {})
    const other = await create<Credentials>('libraries', 'POST', {})
    const connect = (token: string, origin = 'https://sudoku.example', feature = '') => fetcher('/api/v1/live', {
      headers: { Origin: origin, Upgrade: 'websocket', 'Sec-WebSocket-Protocol': ['sudoku-sync', token, feature].filter(Boolean).join(', ') },
    })
    assert.equal((await connect(first.token, 'https://unrelated.example')).status, 403)
    assert.equal((await connect('0'.repeat(64))).status, 401)
    assert.equal(upgrades.length, 0)
    assert.equal((await connect(first.token)).status, 204)
    assert.equal((await connect(other.token, undefined, 'sudoku-sync-presence')).status, 204)
    assert.notEqual(upgrades[0].library, upgrades[1].library)
    assert.equal(upgrades[0].request.headers.get('X-Sync-Device'), first.id)
    assert.equal(upgrades[0].request.headers.has('Sec-WebSocket-Protocol'), false)
    assert.equal(upgrades[0].request.headers.has('X-Sync-Presence'), false)
    assert.equal(upgrades[1].request.headers.get('X-Sync-Presence'), '1')

    const auth = syncRequest(first.token, fetcher)
    const a = client(first, auth)
    a.write(makeGame('live-sync', 'Live sync', EMPTY, 'custom'))
    await a.run()
    const event = { library: upgrades[0].library, message: 'changes', device: first.id }
    assert.deepEqual(events, [event])
    await assert.rejects(auth('puzzles/live-sync', 'PUT', {}), { status: 400 })
    assert.deepEqual(events, [event])
    await auth('devices/' + first.id, 'DELETE')
    assert.deepEqual(events.at(-1), { ...event, message: 'revoked' })
    assert.equal((await connect(first.token)).status, 401)
  } finally { sqlite.close() }
})

test('devices link without names and labels can be renamed only within the linked library', async () => {
  const { sqlite, fetcher } = syncDatabase()
  const anon = syncRequest(undefined, fetcher)
  try {
    const first = await anon<Credentials & { recovery: string }>('libraries', 'POST')
    const phone = syncRequest(first.token, fetcher)
    const { ticket } = await phone<{ ticket: string }>('invitations', 'POST')
    const second = await anon<Credentials>('join', 'POST', { secret: ticket })
    const computer = syncRequest(second.token, fetcher)
    const third = await anon<Credentials>('recover', 'POST', { secret: first.recovery, name: '  ' })
    const devices = () => phone<{ id: string; name: string }[]>('devices')
    const initialLabels = new Map((await devices()).map(device => [device.id, device.name]))
    for (const device of [first, second, third]) assert.match(initialLabels.get(device.id)!, /^Device [0-9A-F]{6}$/)

    const target = 'devices/' + second.id
    assert.deepEqual(await phone(target, 'PATCH', { name: '  My laptop  ' }), { name: 'My laptop' })
    await computer('devices/' + first.id, 'PATCH', { name: 'My laptop' })
    assert.equal((await devices()).filter(device => device.name === 'My laptop').length, 2)

    const stranger = await anon<Credentials>('libraries', 'POST', { name: 'My laptop' })
    await assert.rejects(syncRequest(stranger.token, fetcher)(target, 'PATCH', { name: 'Other' }), { status: 404 })
    await assert.rejects(anon(target, 'PATCH', { name: 'Other' }), { status: 401 })
    await assert.rejects(phone(target, 'PATCH', {}), { status: 400 })
    assert.equal((await devices()).find(d => d.id === second.id)?.name, 'My laptop')

    assert.deepEqual(await computer(target, 'PATCH', { name: '' }), { name: initialLabels.get(second.id) })
    await phone(target, 'DELETE')
    await assert.rejects(computer('devices/' + first.id, 'PATCH', { name: 'Other' }), { status: 401 })
  } finally { sqlite.close() }
})

test('two devices resume full independent saves, order by play, and retain both offline versions', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const a = client(creator, phone), b = client(second, computer)
    const first = undo(enter(enter(makeGame('one', 'First', EMPTY, 'custom', 1), [0], 'value', 1), [3], 'corner', 2))
    const other = enter(makeGame('two', 'Second', EMPTY, 'custom', 2), [2], 'center', 3)
    a.write(first); a.write(other)
    a.storage.setItem(activityPrefix + first.id, '12345')
    await a.run(); await b.run()
    assert.deepEqual(b.read('one'), JSON.parse(JSON.stringify(first)))
    assert.deepEqual(inProgress(b.games(), b.storage).map(game => game.id), ['one', 'two'])
    a.write(enter(first, [1], 'value', 2)); b.write(enter(other, [3], 'value', 4))
    await a.run(); await b.run(); await a.run()
    assert.deepEqual(a.games(), b.games())
    const stale = b.read('one')!
    a.write(enter(a.read('one')!, [2], 'value', 3)); await a.run()
    b.write(enter(stale, [2], 'value', 4))
    await client(second, computer, b.storage).run()
    await a.run()
    const fork = a.games().find(game => game.id.startsWith('copy-'))!
    assert.match(fork.title, /conflict copy/)
    assert.equal(fork.position.entries[2], '4')
    assert.equal(a.read('one')!.position.entries[2], '3')
    assert.deepEqual(a.read('two'), b.read('two'))
    // The stale device changes a puzzle while the other deletes it.
    a.remove('two'); await a.run()
    b.write(enter(b.read('two')!, [4], 'value', 5)); await b.run(); await a.run()
    assert.equal(a.read('two'), null)
    assert.ok(a.games().some(game => game.title.startsWith('Second (conflict copy)') && game.position.entries[4] === '5'))
  } finally { sqlite.close() }
})

test('an automatically calculated grade does not conflict with an edit from another device', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const puzzle = makeGame('unrated', 'Unrated puzzle', EMPTY, 'custom')
    const a = client(creator, phone), b = client(second, computer)
    a.write(puzzle); await a.run(); await b.run()
    const grade = { difficulty: 'easy' as const, points: 500, scoringVersion: 1, techniqueOrder: [] }
    b.write({ ...b.read(puzzle.id)!, difficulty: grade.difficulty, score: grade.points, ratingAttempt: ratingAttemptFor(grade) })
    a.write(enter(puzzle, [0], 'value', 1)); await a.run()
    await b.run(); await a.run()
    assert.equal(b.read(puzzle.id)?.position.entries[0], '1')
    assert.equal(b.games().length, 1)
    assert.equal(a.games().length, 1)
  } finally { sqlite.close() }
})

test('classifying a downloaded move neither uploads it again nor conflicts with the next move', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const a = client(creator, phone), b = client(second, computer)
    const puzzle = makeGame('attribution', 'Attribution', EMPTY, 'custom')
    const first = recordAction(puzzle, enter(puzzle, [0], 'value', 1))
    a.write(first); await a.run(); await b.run()

    const received = b.read(puzzle.id)!
    const [{ pending, ...action }] = received.actionHistory!
    b.write({ ...received, actionHistory: [{ ...action, technique: 'naked-single' }] })
    await b.run()
    assert.equal((await phone<{ revision: number }>('puzzles/' + puzzle.id)).revision, 1)

    a.write(recordAction(first, enter(first, [1], 'value', 2)))
    await a.run(); await b.run(); await a.run()
    assert.equal(b.read(puzzle.id)?.position.entries.slice(0, 2), '12')
    assert.equal(b.games().length, 1)
    assert.equal(a.games().length, 1)
  } finally { sqlite.close() }
})

test('checking for changes and syncing a single puzzle leave other local edits pending', async () => {
  const { sqlite, creator, phone, computer } = await library()
  try {
    const storage = new MemoryStorage()
    const requests: string[] = []
    const engine = createSyncEngine(storage, creator.id, (path, method, body) => {
      requests.push((method ?? 'GET') + ' ' + path)
      return phone(path, method, body)
    }, () => {})
    for (const id of ['first', 'second']) {
      const puzzle = enter(makeGame(id, id, EMPTY, 'custom'), [0], 'value', 3)
      storage.setItem(GAME_PREFIX + id, JSON.stringify(puzzle))
    }
    await engine.run({ uploads: new Set() })
    assert.ok(!requests.some(request => request.startsWith('PUT')))
    assert.deepEqual(await engine.pendingIds(), new Set(['first', 'second']))

    requests.length = 0
    await engine.run({ uploads: new Set(['first']), includeElapsed: true, settings: false })
    assert.deepEqual(requests, ['GET changes?after=0', 'PUT puzzles/first'])
    assert.equal((await computer<{ game: Game }>('puzzles/first')).game.position.entries[0], '3')
    await assert.rejects(computer('puzzles/second'), { status: 404 })
    assert.deepEqual(await engine.pendingIds(), new Set(['second']))

    requests.length = 0
    await engine.run({ uploads: new Set(['first']), includeElapsed: true, settings: false })
    assert.ok(!requests.some(request => request.startsWith('PUT')))
  } finally { sqlite.close() }
})

test('a lost upload response and a further offline edit replay without duplicating the puzzle', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    let drop = true
    const a = client(creator, async (path, method, body) => {
      const result = await phone(path, method, body)
      if (method === 'PUT' && drop) { drop = false; throw new Error('Connection lost') }
      return result as never
    })
    const game = makeGame('one', 'Phone', EMPTY, 'custom')
    a.write(game); await assert.rejects(a.run(), /Connection lost/)
    a.write(enter(game, [1], 'value', 2)); await a.run()
    const b = client(second, computer); await b.run()
    assert.equal(b.games().length, 1)
    assert.equal(b.read('one')!.position.entries[1], '2')
    b.write({ ...b.read('one')!, elapsed: 38 }); await b.run(); await a.run()
    assert.equal(a.read('one')!.elapsed, 0)
    await b.run({ uploads: new Set(['one']), includeElapsed: true }); await a.run()
    assert.equal(a.read('one')!.elapsed, 38)
  } finally { sqlite.close() }
})

test('simultaneous writes preserve both moves, while a stale unmodified device accepts a deletion', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const a = client(creator, phone), b = client(second, computer)
    const game = makeGame('live', 'Live puzzle', EMPTY, 'imported')
    a.write(game); await a.run(); await b.run()
    a.write(enter(game, [0], 'value', 1))
    b.write(enter(game, [0], 'value', 2))
    await Promise.all([a.run(), b.run()])
    await a.run(); await b.run(); await a.run()
    assert.deepEqual(a.games().map(g => g.position.entries[0]).sort(), ['1', '2'])
    assert.equal(b.games().length, 2)
    a.remove('live'); await a.run(); await b.run()
    assert.equal(b.read('live'), null)
    assert.equal(b.games().length, 1)
  } finally { sqlite.close() }
})

test('link populated devices: keep completed and ongoing attempts, including two independent attempts at the same grid', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const a = client(creator, phone), b = client(second, computer)
    const solved = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
    for (const [device, name] of [[a, 'phone'], [b, 'computer']] as const) {
      device.write(enter(makeGame(name + '-finished', name, '0' + solved.slice(1), 'imported'), [0], 'value', 5))
      device.write(enter(makeGame(name + '-playing', name, EMPTY, 'imported'), [0], 'value', 1))
    }
    await a.run(); await b.run(); await a.run(); await b.run()
    for (const device of [a, b]) {
      assert.equal(device.games().length, 4)
      assert.deepEqual(device.games().filter(isSolved).map(game => game.id).sort(), ['computer-finished', 'phone-finished'])
      assert.deepEqual(inProgress(device.games(), device.storage).map(game => game.id).sort(), ['computer-playing', 'phone-playing'])
    }
  } finally { sqlite.close() }
})

test('settings seed missing choices, merge individual offline edits and reflect a reset to defaults', async () => {
  const { sqlite, creator, phone, second, computer, anon, fetcher } = await library()
  try {
    const a = client(creator, phone), b = client(second, computer)
    const appearance = 'sudoku-app:v1:appearance', timing = 'sudoku-app:v1:puzzle-timing'
    const write = (device: typeof a, key: string, value: object) => device.storage.setItem(key, JSON.stringify(value))
    const read = (device: typeof a, key: string) => JSON.parse(device.storage.getItem(key)!)
    write(a, appearance, { lightTheme: 'forest', showGuides: false })
    write(b, appearance, { lightTheme: 'ocean', showGuides: true })
    write(a, timing, { showTimer: false, showPause: true })
    b.storage.setItem('sudoku-app:v1:input-panel-height', '330')
    await a.run(); await b.run(); await a.run()
    for (const device of [a, b]) {
      assert.equal(read(device, appearance).lightTheme, 'forest')
      assert.equal(read(device, appearance).showGuides, true)
      assert.equal(read(device, timing).showTimer, false)
    }
    assert.equal(a.storage.getItem('sudoku-app:v1:input-panel-height'), null)
    write(a, timing, { ...read(a, timing), showTimer: true })
    write(b, timing, { ...read(b, timing), showPause: false })
    await Promise.all([a.run(), b.run()])
    await a.run(); await b.run()
    for (const device of [a, b]) {
      assert.equal(read(device, timing).showTimer, true)
      assert.equal(read(device, timing).showPause, false)
    }
    const stranger = await anon<Credentials>('libraries', 'POST')
    const foreign = syncRequest(stranger.token, fetcher)
    assert.deepEqual(await foreign('changes?settings=1'), { changes: [], settings: {} })
    await assert.rejects(anon('settings', 'PATCH', { seeds: {}, edits: {} }), { status: 401 })
    await phone('devices/' + second.id, 'DELETE')
    await assert.rejects(computer('settings', 'PATCH', { seeds: {}, edits: {} }), { status: 401 })
  } finally { sqlite.close() }
})

test('pause on open and the last puzzle pause state travel between linked devices', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const a = client(creator, phone), b = client(second, computer)
    a.storage.setItem(TIMING_KEY, JSON.stringify({ showTimer: false }))
    assert.equal(readTiming(a.storage).pauseOnOpen, true)
    const game = enter(makeGame('paused', 'Paused puzzle', EMPTY, 'imported'), [0], 'value', 1)
    a.write(setGamePaused(game, true, { onOpen: true }))
    await a.run(); await b.run()
    assert.equal(readTiming(b.storage).pauseOnOpen, true)
    assert.equal(b.read(game.id)?.paused, true)

    a.storage.setItem(TIMING_KEY, JSON.stringify({ ...readTiming(a.storage), pauseOnOpen: false }))
    await a.run(); await b.run()
    assert.equal(readTiming(b.storage).pauseOnOpen, false)
    assert.equal(b.read(game.id)?.paused, true)

    b.write(setGamePaused(b.read(game.id)!, false))
    await b.run(); await a.run()
    assert.equal(a.read(game.id)?.paused, false)

    b.storage.setItem(TIMING_KEY, JSON.stringify({ ...readTiming(b.storage), pauseOnOpen: true }))
    await b.run(); await a.run()
    assert.equal(readTiming(a.storage).pauseOnOpen, true)
    assert.equal(readTiming(a.storage).showTimer, false)
  } finally { sqlite.close() }
})

test('settings changed during an upload are still pending after a reload', async () => {
  const { sqlite, creator, phone, second, computer } = await library()
  try {
    const storage = new MemoryStorage()
    const key = 'sudoku-app:v1:error-mode'
    storage.setItem(key, 'none')
    const duringUpload: typeof phone = async (path, method, body) => {
      if (path === 'settings') storage.setItem(key, 'incorrect')
      return phone(path, method, body)
    }
    await client(creator, duringUpload, storage).run()
    assert.equal(storage.getItem(key), 'incorrect')
    await client(creator, phone, storage).run()
    const b = client(second, computer)
    await b.run()
    assert.equal(b.storage.getItem(key), 'incorrect')
  } finally { sqlite.close() }
})
