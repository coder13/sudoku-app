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

test('the final marks in the multi-digit examples hold in every possible filling', () => {
  for (const id of ['candidate-elimination', 'subset-count', 'wing-cases', 'contradiction', 'loop-alternating-links', 'placement-capacity',
    'naked-triple-count', 'naked-quadruple-count', 'locked-pair-two-houses', 'wxyz-wing-all-restricted', 'overlap-uses-two-slots'] as const) {
    const visual = foundationVisuals[id]
    const solutions = completions(visual)
    assert.ok(solutions.length > 0, id)
    for (const { cell, digit, kind } of visual.steps.at(-1)!.marks!) {
      if (kind === 'result') assert.ok(solutions.every(values => values.get(cell) === digit), `${id}: placement`)
      if (kind === 'removal') assert.ok(solutions.every(values => values.get(cell) !== digit), `${id}: removal`)
    }
  }
})

test('3D Medusa illustrates each conflict and each way both colors rule out a candidate', () => {
  const article = catalog.lessonRoutes.get('3d-medusa')!
  const conflicts = ['medusa-two-digits', 'medusa-repeat-digit', 'medusa-empty-cell', 'medusa-empty-house'] as const
  const traps = ['medusa-two-colors-in-cell', 'medusa-two-peers', 'medusa-cell-and-peer'] as const
  const start = article.blocks.findIndex(block => block.type === 'heading' && block.id === 'medusa-conflicts')
  const split = article.blocks.findIndex(block => block.type === 'heading' && block.id === 'medusa-traps')
  const visualIds = (blocks: typeof article.blocks) => blocks.flatMap(block => block.type === 'foundation-visual' ? [block.visual] : [])
  assert.deepEqual(visualIds(article.blocks.slice(start, split)), conflicts)
  assert.deepEqual(visualIds(article.blocks.slice(split)), traps)

  const marks = (id: typeof conflicts[number] | typeof traps[number]) => foundationVisuals[id].steps[0].marks!
  const rulesOut = (source: { cell: number; digit: number }, target: typeof source) =>
    source.cell === target.cell ? source.digit !== target.digit : source.digit === target.digit && peer(source.cell, target.cell)
  for (const id of ['medusa-two-digits', 'medusa-repeat-digit'] as const) {
    const [a, b] = marks(id)
    assert.equal(a.kind, b.kind, id)
    assert.equal(a.cell === b.cell, id === 'medusa-two-digits', id)
    assert.ok(rulesOut(a, b), id)
  }
  for (const id of ['medusa-empty-cell', 'medusa-empty-house'] as const) {
    const blue = marks(id).filter(mark => mark.kind === 'pattern')
    const removed = marks(id).filter(mark => mark.kind === 'removal')
    assert.ok(removed.every(target => blue.some(source => rulesOut(source, target))), id)
    const { candidates } = foundationVisuals[id]
    const [first] = removed
    if (id === 'medusa-empty-cell') {
      assert.ok(removed.every(target => target.cell === first.cell), id)
      assert.deepEqual(removed.map(target => target.digit), candidates![first.cell], id)
    } else {
      assert.ok(removed.every(target => target.digit === first.digit && Math.floor(target.cell / 9) === Math.floor(first.cell / 9)), id)
      assert.deepEqual(removed.map(target => target.cell), Object.keys(candidates!).map(Number), id)
    }
  }
  for (const [expected, id] of [[2, traps[0]], [0, traps[1]], [1, traps[2]]] as const) {
    const [blue, amber, target] = marks(id)
    assert.deepEqual([blue.kind, amber.kind, target.kind], ['pattern', 'accent', 'removal'], id)
    assert.ok(rulesOut(blue, target) && rulesOut(amber, target), id)
    assert.equal([blue, amber].filter(source => source.cell === target.cell).length, expected, id)
  }
})

function digitLayouts(candidates: Record<string, number[]>, requiredHouses: number[][]) {
  const cells = Object.keys(candidates).map(Number)
  const layouts = Array.from({ length: 1 << cells.length }, (_, mask) => cells.filter((_, i) => mask & (1 << i)))
  return layouts.filter(layout =>
    layout.every((cell, i) => layout.slice(0, i).every(other => !peer(cell, other))) &&
    requiredHouses.every(house => house.filter(cell => layout.includes(cell)).length === 1))
}

test('both fish placements use every cover and exclude the marked candidate', () => {
  const visual = foundationVisuals['fish-count']
  const layouts = digitLayouts(visual.candidates!, [[20, 21], [39, 42], [56, 60]])
  assert.deepEqual(layouts, [[21, 42, 56], [20, 39, 60]])
  assert.ok(layouts.every(layout => !layout.includes(30)))
})

test('both color states are possible and rule out the same target', () => {
  const visual = foundationVisuals['coloring-states']
  const layouts = digitLayouts(visual.candidates!, [[10, 13], [13, 31], [29, 31]])
  assert.deepEqual(layouts, [[13, 29], [10, 31]])
  assert.ok(layouts.every(layout => !layout.includes(20)))
})

test('the illustrated closed chains eliminate or place their starting candidate', () => {
  const visual = foundationVisuals['loop-matching-links']
  assert.deepEqual(digitLayouts(visual.candidates!, [[9, 11]]), [[9], [11]])
  assert.deepEqual(digitLayouts(visual.steps.at(-1)!.candidates!, [[10, 11], [10, 19]]), [[10]])
})

test('either ALS digit can be absent but the set needs at least one of them', () => {
  const fillings = completions(foundationVisuals['als-link']).map(values => [...values.values()])
  assert.ok(fillings.every(digits => digits.includes(1) || digits.includes(4)))
  assert.ok(fillings.some(digits => digits.includes(1) && digits.includes(4)))
  for (const digit of [1, 4]) assert.ok(fillings.some(digits => !digits.includes(digit)))
})

test('both complete layouts agree on the placement in row 3', () => {
  const visual = foundationVisuals['complete-digit-layouts']
  const layouts = digitLayouts(visual.candidates!, [[1, 4], [10, 13], [22, 25]])
  assert.deepEqual(layouts, [[4, 10, 25], [1, 13, 25]])
  for (const layout of layouts) {
    const withGivens = [...layout, 27, 39, 51, 56, 68, 80]
    assert.ok(withGivens.every((cell, i) => withGivens.slice(0, i).every(other => !peer(cell, other))))
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
