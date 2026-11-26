import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'

const fixtureRoot = new URL('./fixtures/', import.meta.url)
const fixturePath = new URL(fixtureRoot).pathname
const codes = new Map<string, string>()

function visit(value: unknown, file: string, keyPath = '$') {
  if (typeof value === 'string' && value.startsWith('SCv7_32_')) {
    codes.set(value, `${file}:${keyPath}`)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, file, `${keyPath}[${index}]`))
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) visit(item, file, `${keyPath}.${key}`)
  }
}

for (const name of readdirSync(fixturePath).filter(name => name.endsWith('.json')).sort()) {
  const path = join(fixturePath, name)
  visit(JSON.parse(readFileSync(path, 'utf8')), relative(fixturePath, path))
}

const expectedRejections = new Map([
  ['little-killer-unsupported-DLeM.json:$.metadata.sudoku', /invalid or cosmetic Little Killer clue/],
  ['parity-coach.json:$.examples[0].coach', /3 × 3 Jigsaw grid needs three connected regions of three cells/],
  ['parity-coach.json:$.examples[1].coach', /3 × 3 Jigsaw grid needs three connected regions of three cells/],
])

test('every preserved raw Coach fixture imports or matches its explicit unsupported control', async () => {
  assert.equal(codes.size, 120)
  const rejected = new Set<string>()

  for (const [code, source] of [...codes].sort(([, left], [, right]) => left.localeCompare(right))) {
    const expected = expectedRejections.get(source)
    if (expected) {
      await assert.rejects(detectPuzzle(code), expected, source)
      rejected.add(source)
      continue
    }

    const imported = await detectPuzzle(code)
    assert.equal(imported.format, 'Sudoku Coach', source)
  }

  assert.deepEqual([...rejected].sort(), [...expectedRejections.keys()].sort())
})
