import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { libraryCollections, libraryLevel } from '../src/sudoku/sinclair-catalog.ts'
import { createSinclairDownloads } from '../src/sudoku/sinclair-download.ts'
import { chooseSinclair } from '../src/sudoku/sinclair-deal.ts'
import { definitionOf, libraryId, puzzleCode, type SinclairPack } from '../src/sudoku/sinclair-format.ts'
import { getCollection, getGameCollection } from '../src/sudoku/collections.ts'
import { collectionGridHash } from '../src/sudoku/collection-integrity.ts'
import { collectionVariantHash } from '../src/sudoku/collection-data.ts'
import { VARIANTS, variantDifficulties, type VariantId } from '../src/sudoku/variants.ts'
import { makeGame } from '../src/sudoku/game.ts'
import { collectionDownloadUrl } from '../src/sudoku/collection-downloads.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

const file = (path: string) => readFileSync(new URL('../public' + path, import.meta.url), 'utf8')
const json = (url: string): SinclairPack => JSON.parse(file(url))
const level = libraryLevel('classic', 'impossible')
const pack = json(level.url)
const ids = level.rows.map(([given]) => puzzleCode('impossible', given))

test('the deploy includes 100 checked definitions and different completed grids at each selectable difficulty', () => {
  const answers = new Set<string>(), displayed = new Set<string>(), urls = new Set<string>()
  const indexText = readFileSync(new URL('../src/sudoku/generated/sinclair-index.json', import.meta.url), 'utf8')
  assert.ok(!/[0-9]{81}/.test(indexText))
  assert.ok(gzipSync(indexText).length < 150 * 1024)
  assert.equal(libraryCollections.length, Object.keys(VARIANTS).length)
  for (const family of Object.keys(VARIANTS) as VariantId[]) {
    const collection = getCollection(libraryId(family))!
    for (const tier of variantDifficulties(family)) {
      if (tier === 'auto') continue
      const level = libraryLevel(family, tier), text = file(level.url), pack: SinclairPack = JSON.parse(text)
      assert.ok(!urls.has(level.url))
      urls.add(level.url)
      assert.equal(createHash('sha256').update(text).digest('hex'), level.hash)
      assert.equal(collectionGridHash(text), level.checksum)
      assert.equal(Buffer.byteLength(text), level.bytes)
      const group = collection.puzzles.filter(p => p.difficulty === tier)
      assert.equal(group.length, 100)
      assert.equal(pack.puzzles.length, 100)
      pack.puzzles.forEach((row, i) => {
        const puzzle = definitionOf(row), info = group[i]
        if (family === 'killer-cages') assert.equal(puzzle.givens, '0'.repeat(81))
        assertVariantCompletion(puzzle, row[1])
        assert.ok(!answers.has(row[2]) && !displayed.has(row[1]), info.title)
        answers.add(row[2]); displayed.add(row[1])
        assert.equal(info.givensHash, collectionGridHash(puzzle.givens))
        assert.equal(info.variantHash, family === 'classic' ? undefined : collectionVariantHash(puzzle))
        assert.equal(info.points,row[3])
        assert.equal(info.hardestTechnique,pack.order[row[4]])
        assert.equal(collectionDownloadUrl(collection,info),level.url)
      })
    }
  }
  assert.equal(urls.size, 66)
  assert.equal(answers.size, 6600)
})

test('Sinclair downloads share a request, retry bad data, and reopen offline from a fresh session', async () => {
  const entries = new Map<string,string>(), calls: string[] = []
  const cache = {
    async keys() { return [...entries.keys()].map(url => new Request('https://example.test' + url)) },
    async match(url: string) { return entries.has(url) ? new Response(entries.get(url)) : undefined },
    async put(url: string, value: Response) { entries.set(url,await value.text()) },
    async delete(url: string) { return entries.delete(url) },
  } as unknown as Cache
  let valid = false
  const downloads = createSinclairDownloads(async url => {
    calls.push(url)
    return new Response(valid ? file(url) : '<html>Missing</html>')
  }, async () => cache)
  await assert.rejects(downloads.load('classic','impossible'), /incomplete/)
  valid = true
  const controller = new AbortController()
  const cancelled = downloads.load('classic','impossible', controller.signal)
  controller.abort()
  const opened = downloads.load('classic','impossible')
  await assert.rejects(cancelled, { name:'AbortError' })
  assert.equal((await opened).puzzles.length,100)
  assert.deepEqual(calls,[level.url,level.url])
  const offline = createSinclairDownloads(async () => { throw TypeError('offline') }, async () => cache)
  await offline.discover()
  assert.ok(offline.saved(level.url))
  assert.deepEqual(await offline.load('classic','impossible'), pack)
  await assert.rejects(offline.load('arrow','easy'), /Connect to the internet/)
  entries.set(level.url,'corrupt')
  const repaired = createSinclairDownloads(async url => new Response(file(url)),async () => cache)
  assert.deepEqual(await repaired.load('classic','impossible'),pack)
  assert.equal(entries.get(level.url),file(level.url))
})

test('a pack can be saved after storage becomes available without another download', async () => {
  let available = false, requests = 0, stored = ''
  const cache = {
    async match() { return undefined },
    async put(_url: string, response: Response) { stored = await response.text() },
  } as unknown as Cache
  const downloads = createSinclairDownloads(async url => {
    requests++
    return new Response(file(url))
  }, async () => available ? cache : undefined)
  await downloads.load('classic', 'impossible')
  assert.ok(downloads.ready(level.url))
  assert.equal(downloads.saved(level.url), false)
  await assert.rejects(downloads.saveOffline('classic','impossible'), /ready for this session/)
  available = true
  await downloads.saveOffline('classic','impossible')
  assert.ok(downloads.saved(level.url))
  assert.equal(stored, file(level.url))
  assert.equal(requests, 1)
})

test('a deal skips saved solution classes and issued IDs, honors focus, and stops at exhaustion', () => {
  const used = new Set([pack.puzzles[0][2]])
  const dealt = [ids[1]]
  const row = pack.puzzles[2], g = makeGame('3','Classic',definitionOf(row).givens,'generated')
  g.collection = {collectionId:libraryId('classic'),puzzleId:ids[2]}
  assert.ok(getGameCollection(g))
  const selected = new Set<number>()
  for(let n=0;n<97;n++) {
    const i = chooseSinclair(pack,ids,dealt,used,[g],n+1)
    assert.ok(i>2 && !selected.has(i))
    selected.add(i); dealt.push(ids[i])
  }
  assert.throws(() => chooseSinclair(pack,ids,dealt,used,[g],13),/seen every available/)
  const focus = pack.order[pack.puzzles[0][4]]
  const i = chooseSinclair(pack,ids,[],new Set(),[],2026,[{ technique:focus,puzzles:4,withoutHints:0,withHints:4,independence:0 }])
  assert.ok(pack.puzzles[i][5].includes(pack.order.indexOf(focus)))
})
