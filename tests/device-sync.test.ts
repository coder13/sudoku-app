import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeGame, EMPTY, enter, undo, type Game } from '../src/sudoku/game.ts'
import { GAME_PREFIX } from '../src/sudoku/storage.ts'
import { activityPrefix, inProgress } from '../src/sudoku/puzzle-activity.ts'
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
