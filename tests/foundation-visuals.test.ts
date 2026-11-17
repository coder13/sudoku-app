import assert from 'node:assert/strict'
import test from 'node:test'
import content from '../src/sudoku/learn-content.json' with { type: 'json' }
import { foundationBoard, foundationVisuals, type FoundationVisualDefinition } from '../src/sudoku/foundation-visuals.ts'
import { lessonCatalog, type LearnContent } from '../src/sudoku/lesson-content.ts'
import { peer } from '../src/sudoku/game.ts'
import { validateContent } from '../tools/lesson-editor/validate.mjs'

const catalog = lessonCatalog(content as LearnContent)
const points = (point: { cell?: number; cells?: readonly number[]; digit?: number }) =>
  (point.cells ?? [point.cell!]).map(cell => ({ cell, digit: point.digit! }))

test('every foundation has a visual and the initial fundamentals teach the diagram key', () => {
  for (const article of catalog.articles.filter(article => article.kind === 'foundation')) {
    assert.ok(article.blocks.some(block => block.type === 'foundation-visual'), article.id)
  }
  assert.ok(content.fundamentals.blocks.some(block => block.type === 'foundation-visual' && block.visual === 'diagram-key'))
  const invalid = structuredClone(content) as LearnContent
  const block = invalid.fundamentals.blocks.find(block => block.type === 'foundation-visual')!
  Object.assign(block, { visual: 'missing-visual' })
  assert.throws(() => validateContent(invalid, content, [...catalog.lessonExampleIds]), /known foundation visual/)
})

test('visual marks and link endpoints stay on visible candidates within the crop', () => {
  for (const [id, visual] of Object.entries(foundationVisuals)) {
    for (const step of visual.steps) {
      if (!visual.region) continue
      const { row, column, rows, columns } = visual.region
      const { candidates } = foundationBoard(visual, step)
      const visible = ({ cell, digit }: { cell: number; digit: number }) => {
        assert.ok(Math.floor(cell / 9) >= row && Math.floor(cell / 9) < row + rows, id)
        assert.ok(cell % 9 >= column && cell % 9 < column + columns, id)
        assert.ok(candidates[cell] & (1 << (digit - 1)), `${id}: missing ${digit} in cell ${cell}`)
      }
      step.marks?.forEach(visible)
      step.links?.forEach(link => {
        points(link.from).forEach(visible)
        points(link.to).forEach(visible)
      })
    }
  }
})

test('every illustrated direct link has its stated strong or weak property', () => {
  for (const [id, visual] of Object.entries(foundationVisuals)) {
    for (const step of visual.steps) {
      const candidates = step.candidates ?? visual.candidates ?? {}
      for (const link of step.links ?? []) {
        const from = points(link.from), to = points(link.to)
        if (link.kind === 'weak') {
          assert.ok(from.every(a => to.every(b => a.cell === b.cell ? a.digit !== b.digit : a.digit === b.digit && peer(a.cell, b.cell))), id)
        } else {
          const ends = [...from, ...to]
          if (ends.every(end => end.cell === ends[0].cell)) {
            assert.deepEqual([...candidates[ends[0].cell]].sort(), ends.map(end => end.digit).sort(), id)
          } else {
            assert.ok(ends.every(end => end.digit === ends[0].digit), id)
            const houses = [
              (cell: number) => Math.floor(cell / 9),
              (cell: number) => cell % 9,
              (cell: number) => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3),
            ]
            assert.ok(houses.some(house => ends.every(end => house(end.cell) === house(ends[0].cell)) &&
              Object.entries(candidates).filter(([cell, digits]) => house(Number(cell)) === house(ends[0].cell) && digits.includes(ends[0].digit)).length === ends.length), id)
          }
        }
      }
    }
  }
})

function completions(visual: FoundationVisualDefinition) {
  let assignments: Map<number, number>[] = [new Map()]
  for (const [cellName, digits] of Object.entries(visual.candidates!)) {
    const cell = Number(cellName)
    assignments = assignments.flatMap(values => digits.filter(digit => [...values].every(([other, value]) =>
      !peer(cell, other) || digit !== value)).map(digit => new Map([...values, [cell, digit]])))
  }
  return assignments
}

test('the final subset, wing, and contradiction results hold in every possible filling', () => {
  for (const id of ['candidate-elimination', 'wing-cases', 'contradiction'] as const) {
    const visual = foundationVisuals[id]
    const solutions = completions(visual)
    assert.ok(solutions.length > 0, id)
    for (const { cell, digit, kind } of visual.steps.at(-1)!.marks!) {
      if (kind === 'result') assert.ok(solutions.every(values => values.get(cell) === digit), `${id}: placement`)
      if (kind === 'removal') assert.ok(solutions.every(values => values.get(cell) !== digit), `${id}: removal`)
    }
  }
})

test('the chain proves its endpoint relation and removal without choosing an endpoint', () => {
  // A = B - C = D, with each row pair also a weak link. T sees A and D.
  const cases = Array.from({ length: 32 }, (_, bits) => Array.from({ length: 5 }, (_, i) => Boolean(bits & (1 << i))))
    .filter(([a,b,c,d,t]) => (a || b) && !(a && b) && !(b && c) && (c || d) && !(c && d) && !(t && a) && !(t && d))
  assert.ok(cases.length > 0)
  assert.ok(cases.every(([a,, ,d,t]) => (a || d) && !t))
  assert.ok(cases.some(([a,,,d]) => a && d), 'A strong endpoint relation can have both ends true')
  assert.ok(cases.some(([a]) => a) && cases.some(([a]) => !a))
})

test('the RCC example permits both sets to omit 6 and rejects an unseen occurrence', () => {
  const visual = foundationVisuals['rcc-link']
  assert.ok(completions(visual).some(values => [...values.values()].every(digit => digit !== 6)))
  const altered = { ...visual, candidates: visual.steps.at(-1)!.candidates! }
  const a = [63, 64], b = [67, 77]
  const occurrences = (cells: number[]) => cells.filter(cell => altered.candidates![cell].includes(6))
  assert.equal(occurrences(a).every(left => occurrences(b).every(right => peer(left, right))), false)
  assert.ok(completions(altered).some(values => a.some(cell => values.get(cell) === 6) && b.some(cell => values.get(cell) === 6)))
})
