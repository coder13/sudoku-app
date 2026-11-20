import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { coreModeLimit, coreSudokuModes, readSudokuModes, writeSudokuModes } from '../src/sudoku/custom-modes.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

let server: ViteDevServer
let renderNewPuzzle: (path: string) => Promise<string>
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ renderNewPuzzle } = await server.ssrLoadModule('/tests/helpers/new-puzzle-render.tsx'))
})
after(async () => { await server?.close() })

test('the default chooser offers five 9×9 modes and a separate custom builder', async () => {
  const markup = await renderNewPuzzle('/puzzles/new')
  assert.match(markup, /Choose a Sudoku mode/)
  assert.match(markup, /X Sudoku/)
  assert.match(markup, /Other grid sizes/)
  assert.match(markup, /\/puzzles\/new\/custom/)
  assert.equal([...markup.matchAll(/href="\/puzzles\/new\/difficulty\?variant=/g)].length, 5)
  assert.doesNotMatch(markup, />Quadruple</)
  const builder = await renderNewPuzzle('/puzzles/new/custom')
  assert.equal([...builder.matchAll(/type="checkbox"/g)].length, 36)
  assert.match(builder, /Show in core modes/)
  assert.match(builder, /Save mode/)
  assert.match(builder, /Generate puzzle/)
  assert.match(builder, /<option value="hard">Hard<\/option>/)
})

test('saved mode definitions and rule choices round-trip, with nine core slots in total', () => {
  const storage = new MemoryStorage()
  const modes = Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`, name: `Mode ${i}`,
    rules: ['windoku', 'arrow'] as const, pinned: true,
  }))
  writeSudokuModes(modes, storage)
  const saved = readSudokuModes(storage)
  assert.equal(saved.length, 6)
  assert.equal(coreSudokuModes.length + saved.filter(mode => mode.pinned).length, coreModeLimit)
  assert.deepEqual(saved[5].rules, ['windoku', 'arrow'])
  assert.equal(saved[5].pinned, false)
})
