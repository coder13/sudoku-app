// Bind independent grade receipts and the source edition to the actual Netlify build.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { definitionOf, packUrl } from '../../src/sudoku/sinclair-format.ts'

const research = 'docs/research/sinclair/catalog'
const read = path => readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const publish = read('netlify.toml').match(/^\s*publish\s*=\s*"([^"]+)"/m)?.[1]
assert.ok(publish, 'Missing Netlify publish directory')
const assets = join(publish, 'assets')
const listing = readdirSync(assets)
const engines = listing.filter(name => /^engine-[\w-]+\.wasm$/.test(name))
assert.equal(engines.length, 1)
const wasmSha256 = digest(readFileSync(join(assets, engines[0])))
assert.equal(wasmSha256, digest(readFileSync('src/sudoku/generated/engine.wasm')))

const paths = process.argv.slice(2)
const receipts = new Map()
for (const path of paths.length ? paths : [join(research, 'grades.json')]) {
  const receipt = json(path)
  assert.equal(receipt.wasmSha256, wasmSha256, 'The release engine changed. Recheck the puzzle grades.')
  for (const group of receipt.groups) {
    assert.ok(!receipts.has(group.file), 'Repeated grade receipt for ' + group.file)
    receipts.set(group.file, group)
  }
}

const index = json('src/sudoku/generated/sinclair-index.json')
const release = createHash('sha256'), boards = new Set(), expectedPaths = []
let bytes = 0, puzzles = 0
for (const family of Object.keys(index.variants).sort()) {
  const levels = index.variants[family]
  for (const difficulty of Object.keys(levels).sort()) {
    const file = family + '/' + difficulty + '.json', level = levels[difficulty]
    const source = read(join('data/sinclair', file)), pack = JSON.parse(source)
    const url = packUrl(family, difficulty, level)
    const body = read(join(publish, url))
    expectedPaths.push(url)
    assert.equal(body, JSON.stringify(pack), file)
    assert.equal(level.hash, digest(body), url)
    assert.equal(level.bytes, Buffer.byteLength(body), url)
    assert.equal(pack.puzzles.length, 100, file)
    assert.deepEqual(receipts.get(file), { file, sha256: digest(source), count: 100 })
    release.update(file + '\0').update(source)
    bytes += level.bytes
    puzzles += pack.puzzles.length
    for (const row of pack.puzzles) {
      boards.add(row[1]); boards.add(row[2])
      const { givens } = definitionOf(row)
      if (givens !== '0'.repeat(81)) boards.add(givens)
    }
  }
}
assert.equal(puzzles, 6600)
assert.equal(receipts.size, expectedPaths.length)
const collectionDir = join(publish, 'collections')
const libraryPaths = readdirSync(collectionDir).filter(name => name.startsWith('sinclair-library-'))
  .flatMap(folder => readdirSync(join(collectionDir, folder)).map(name => '/collections/' + folder + '/' + name))
assert.deepEqual(libraryPaths.sort(), expectedPaths.sort())
const releaseSha256 = release.digest('hex')
assert.equal(releaseSha256, json(join(research, 'variety.json')).releaseSha256)
const shellPaths = JSON.parse(read(join(publish, 'sw.js')).match(/^const assets = (\[.*\])$/m)[1])
assert.deepEqual(shellPaths.filter(path => path.startsWith('/collections/')), [])
const scripts = listing.filter(name => name.endsWith('.js'))
const embedded = new Set()
for (const name of scripts) {
  for (const match of read(join(assets, name)).matchAll(/(?<!\d)\d{81}(?!\d)/g)) {
    if (boards.has(match[0])) embedded.add(match[0])
  }
}
assert.equal(embedded.size, 0, 'Found library puzzle digits in app JavaScript')
const save = (file, data) => writeFileSync(join(research, file), JSON.stringify(data, null, 2) + '\n')
save('grades.json', { wasmSha256, releaseSha256, puzzles, groups: [...receipts.values()].sort((a,b) => a.file.localeCompare(b.file)) })
save('deploy.json', { publish, releaseSha256, wasmSha256, packs: expectedPaths.length, puzzles, bytes,
  collectionFilesInShellPrecache: 0, javascriptAssetsChecked: scripts.length, libraryGridsFoundInJavaScript: embedded.size })
console.log('Verified', expectedPaths.length, 'on-demand files and', puzzles, 'grades in the production build.')
