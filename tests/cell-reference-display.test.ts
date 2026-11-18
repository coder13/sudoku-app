import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Difficulty, HintChoice } from '../src/sudoku/engine.ts'
import { describeHint, type CellReferenceOptions } from '../src/sudoku/hints.ts'
import { lessonExample, type EngineLessonExample } from '../src/sudoku/lesson-examples.ts'
import { deductionResults, lessonDiagram } from '../src/sudoku/lesson-diagram.ts'

const corpus: Record<string, EngineLessonExample> = JSON.parse(readFileSync(
  new URL('../src/sudoku/generated/lesson-examples.json', import.meta.url), 'utf8'))
const compact = /\br[1-9]c[1-9]\b/i
const verbose = /\brow [1-9], column [1-9]\b/
const wording = (diagram: ReturnType<typeof lessonDiagram>) => JSON.stringify({
  description: diagram.description, reason: diagram.reason, reasonSteps: diagram.reasonSteps,
  trace: diagram.trace, results: diagram.results,
})

test('all shipped lesson and practice proofs honor explicit cell styles without changing evidence or geometry', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  let workers = 0
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {
    constructor() { workers++; throw new Error('Presentation must not request an engine scan') }
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
  const saved = structuredClone(corpus)
  let proofs = 0, chains = 0, branches = 0, reasonSteps = 0, variants = 0
  for (const [technique, raw] of Object.entries(corpus)) {
    const example = lessonExample(raw)
    for (const position of [example, example.practice]) {
      const baseline = lessonDiagram(position)
      const long = lessonDiagram(position, position.pattern, { cellReferenceStyle: 'verbose' })
      const short = lessonDiagram(position, position.pattern, { cellReferenceStyle: 'concise' })
      assert.doesNotMatch(wording(long), compact, technique)
      // House lists can legitimately say “row 3, column 5”; only cell tokens change.
      assert.equal(wording(long), wording(baseline).replace(/\br([1-9])c([1-9])\b/gi, 'row $1, column $2'), technique)
      assert.equal(wording(short), wording(baseline).replace(/\br([1-9])c([1-9])\b/gi, 'r$1c$2'), technique)
      assert.match(long.results.join(' '), verbose, technique)
      assert.match(short.results.join(' '), /\br[1-9]c[1-9]\b/, technique)
      for (const diagram of [long, short]) {
        assert.deepEqual(diagram.annotations, baseline.annotations, technique)
        assert.deepEqual(diagram.region, baseline.region, technique)
        assert.equal(diagram.mainLabel, baseline.mainLabel, technique)
        assert.equal(diagram.accentLabel, baseline.accentLabel, technique)
      }
      proofs++
      if ('inference' in position.deduction.evidence) chains++
      if (long.trace) branches++
      if (long.reasonSteps?.length) reasonSteps++
      if ('variant' in position.deduction.evidence) variants++
    }
  }
  assert.ok(proofs >= 200 && chains > 0 && branches > 0 && reasonSteps > 0 && variants > 0)
  assert.deepEqual(corpus, saved)
  assert.equal(workers, 0)
})

test('Automatic uses each technique difficulty consistently across actions and the complete proof', () => {
  for (const raw of [corpus.parity, corpus.aic, corpus['nested-forcing-net']]) {
    const example = lessonExample(raw)
    for (const difficulty of ['easy', 'medium', 'tricky', 'impossible'] satisfies Difficulty[]) {
      const options: CellReferenceOptions = { cellReferenceStyle: 'automatic', difficulty }
      const explicit = { ...options, cellReferenceStyle: difficulty === 'easy' || difficulty === 'medium' ? 'verbose' : 'concise' } as const
      assert.deepEqual(lessonDiagram(example, example.pattern, options), lessonDiagram(example, example.pattern, explicit))
      assert.deepEqual(deductionResults(example.deduction.actions, options), deductionResults(example.deduction.actions, explicit))
      assert.deepEqual(describeHint(example.deduction, options), describeHint(example.deduction, explicit))
    }
  }
})

test('variant source context survives serialization and formats parity and Anti-King explanations', () => {
  const parity = lessonExample(corpus.parity)
  const normalized = JSON.parse(JSON.stringify(parity))
  const options = { cellReferenceStyle: 'verbose' } as const
  const long = lessonDiagram(normalized, normalized.pattern, options)
  assert.equal(long.description, 'row 9, column 9 has an odd circle, so it can contain only 1, 3, 5, 7, or 9.')
  assert.equal(describeHint(parity.deduction, options).text, 'Remove 8 from row 9, column 9.')
  assert.deepEqual(long.results, ['Remove 8 from row 9, column 9.'])
  assert.equal(lessonDiagram(parity).description, 'r9c9 has an odd circle, so it can contain only 1, 3, 5, 7, or 9.')
  assert.deepEqual(lessonDiagram(parity).results, ['Remove 8 from R9C9.'])
  const king = lessonExample(corpus['anti-king']).practice
  const kingLong = lessonDiagram(king, king.pattern, options)
  assert.match(kingLong.description, /row [1-9], column [1-9] and row [1-9], column [1-9] touch at a corner/)
  assert.match(kingLong.reason, /The only candidate in row [1-9], column [1-9] is \d\. Remove \d from row [1-9], column [1-9] because the two cells touch at a corner\./)
  assert.doesNotMatch(wording(kingLong), compact)
})

test('legacy variant prose remains verbatim and default lesson actions retain their notation', () => {
  const deduction: HintChoice = { technique: 'custom-rule', actions: [{ place: { cell: 0, digit: 2 } }],
    evidence: { variant: { description: 'Imported title R9C9', reason: 'An opaque explanation with r2c3.' } },
    pattern: { houses: [], cells: [0], candidates: [{ cell: 0, digit: 2 }] } }
  const result = lessonDiagram({ deduction, candidates: [] }, deduction.pattern, { cellReferenceStyle: 'verbose' })
  assert.equal(result.description, 'Imported title R9C9')
  assert.equal(result.reason, 'An opaque explanation with r2c3.')
  assert.deepEqual(result.results, ['Place 2 in row 1, column 1.'])
  assert.deepEqual(deductionResults(deduction.actions), ['Place 2 in R1C1.'])
})
