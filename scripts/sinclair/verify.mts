// Independently count completions and compare them with the checked native trace endpoints.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { countMixedSolutions } from '../../tests/helpers/mixed-oracle.ts'
import { type VariantPuzzle } from '../../src/sudoku/engine.ts'
import { variantDifficulties } from '../../src/sudoku/variants.ts'

const root = new URL('../../', import.meta.url)
const args = process.argv.slice(2)
assert.ok(args.length === 0 || args.length === 2, 'Pass both catalog and research directories, or neither.')
const directory = (arg: string, fallback: string) => arg ? pathToFileURL(resolve(arg) + '/') : new URL(fallback, root)
const catalog = directory(args[0], 'src/sudoku/collections/')
const research = directory(args[1], 'docs/research/sinclair/')
const load = async (base: URL, name: string) => JSON.parse(await readFile(new URL(name, base), 'utf8'))
const edition = await load(research, 'selection.json')
const expected = new Map<string, string>(edition.puzzles.map((p: { id: string; solutionSha256: string }) => [p.id, p.solutionSha256]))
const stats = []
for (const [family, variant] of [['classic', 'classic'], ['killer', 'killer-cages'], ['x', 'diagonal']] as const) {
  const rows = await load(catalog, 'sinclair-' + family + '.json')
  const levels = variantDifficulties(variant).filter(t => t !== 'auto')
  const counts = Object.fromEntries(levels.map(k => [k, 0]))
  let maxNodes = 0
  for (const row of rows) {
    assert.ok(Object.hasOwn(counts, row.difficulty))
    counts[row.difficulty]++
    const p: VariantPuzzle = row.puzzle ?? { version: 1, givens: row.givens }
    const result = countMixedSolutions(p, 10_000_000)
    assert.equal(result.count, 1, row.title)
    const code = row.id.toUpperCase()
    assert.equal(createHash('sha256').update(result.solution!).digest('hex'), expected.get(code), code)
    expected.delete(code)
    maxNodes = Math.max(result.nodes, maxNodes)
    if (family === 'x') {
      assert.deepEqual(p.rules, [{ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' }])
      assert.equal(countMixedSolutions({ version: 1, givens: p.givens }).count, 2, code + ' needs the X rule')
    }
    if (family === 'killer') {
      assert.equal(p.givens, '0'.repeat(81))
      const rule = p.rules?.[0]
      assert.ok(rule?.type === 'killer-cages' && rule.coverGrid && p.rules?.length === 1)
      const covered = []
      for (const cage of rule.cages) {
        const seen = new Set([cage.cells[0]])
        for (const cell of seen) for (const other of cage.cells) {
          if (Math.abs(cell % 9 - other % 9) + Math.abs(Math.floor(cell / 9) - Math.floor(other / 9)) === 1) seen.add(other)
        }
        assert.equal(seen.size, cage.cells.length, code + ' disconnected cage')
        covered.push(...cage.cells)
      }
      assert.deepEqual(covered.toSorted((a,b) => a-b), Array.from({ length: 81 }, (_, i) => i))
    }
  }
  assert.ok(Object.values(counts).every(n => n === 10))
  stats.push({ family, puzzles: rows.length, counts, maxIndependentSearchNodes: maxNodes })
  console.log(family, rows.length, 'verified')
}
assert.equal(expected.size, 0)
await writeFile(new URL('verification.json', research), JSON.stringify(stats, null, 2) + '\n')
