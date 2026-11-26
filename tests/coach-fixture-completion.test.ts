import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { restoreSizedRuleGame } from '../src/sudoku/sized-rule-game.ts'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { assertVariantCompletion } from './helpers/variant-truth.ts'

type Source = { code: string; solution: string; references: string[] }
const fixtureRoot = new URL('./fixtures/', import.meta.url)
const fixturePath = new URL(fixtureRoot).pathname
const sources = new Map<string, Source>()

function collect(value: unknown, file: string, keyPath = '$') {
  if (!value || typeof value !== 'object') return
  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (typeof record.code === 'string' && record.code.startsWith('SCv') && typeof record.solution === 'string') {
      const source = sources.get(record.code) ?? { code: record.code, solution: record.solution, references: [] }
      source.references.push(`${file}:${keyPath}`)
      assert.equal(source.solution, record.solution, 'Repeated source exports must use the same published completion.')
      sources.set(record.code, source)
    }
  }
  if (Array.isArray(value)) value.forEach((item, index) => collect(item, file, `${keyPath}[${index}]`))
  else for (const [key, item] of Object.entries(value)) collect(item, file, `${keyPath}.${key}`)
}

for (const name of readdirSync(fixturePath).filter(name => name.endsWith('.json')).sort()) {
  const path = join(fixturePath, name)
  collect(JSON.parse(readFileSync(path, 'utf8')), relative(fixturePath, path))
}

const standaloneSources = new Set([
  'coach-calcudoku.json:$',
  'modular-coach.json:$.examples[6]',
  'sudoku-coach-boxless-diagonal.json:$',
  'sudoku-coach-boxless-modular.json:$',
])

function assertClassicCompletion(givens: string, solution: string, source: string) {
  assert.match(solution, /^[1-9]{81}$/, source)
  for (let cell = 0; cell < 81; cell++) if (givens[cell] !== '0') assert.equal(solution[cell], givens[cell], `${source}: given ${cell}`)
  for (let index = 0; index < 9; index++) {
    const row = Array.from({ length: 9 }, (_, column) => solution[index * 9 + column])
    const column = Array.from({ length: 9 }, (_, row) => solution[row * 9 + index])
    const box = Array.from({ length: 9 }, (_, offset) => solution[Math.floor(index / 3) * 27 + index % 3 * 3 + Math.floor(offset / 3) * 9 + offset % 3])
    for (const house of [row, column, box]) assert.equal(new Set(house).size, 9, `${source}: classic house ${index}`)
  }
}

test('published completions satisfy every preserved Sudoku Coach fixture combination', async () => {
  assert.equal(sources.size, 80)
  const standaloneSeen = new Set<string>()

  for (const source of sources.values()) {
    const imported = await detectPuzzle(source.code)
    assert.equal(imported.format, 'Sudoku Coach', source.references.join(', '))
    const sourceName = source.references[0]

    if (imported.futoshiki || imported.calcudoku) {
      assert.ok(source.references.every(reference => standaloneSources.has(reference)), sourceName)
      for (const reference of source.references) standaloneSeen.add(reference)
      continue
    }

    if (imported.variant) {
      assertVariantCompletion(imported.variant.puzzle, source.solution)
    } else if (imported.sizedRules && imported.grid) {
      assert.ok(restoreSizedRuleGame({ rules: imported.sizedRules, solution: source.solution, author: imported.sizedAuthor },
        imported.grid, imported.givens), `${sourceName}: sized completion violates its imported rules`)
    } else if (imported.grid) {
      assert.ok(restoreSizedRuleGame({ rules: [], solution: source.solution }, imported.grid, imported.givens),
        `${sourceName}: sized classic completion violates its grid or givens`)
    } else {
      assertClassicCompletion(imported.givens, source.solution, sourceName)
    }
  }

  assert.deepEqual([...standaloneSeen].sort(), [...standaloneSources].sort())
})
