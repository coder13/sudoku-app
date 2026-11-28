import assert from 'node:assert/strict'
import test from 'node:test'
import { hasReadableArrowLayout, MAX_GENERATED_ARROWS, selectReadableArrows } from '../src/sudoku/arrow-layout.ts'

const arrow = (circle: number, ...cells: number[]) => ({ type: 'arrow' as const, circle, cells })

test('generated arrows stay separate even when diagonal shafts have no cells in common', () => {
  const first = arrow(0, 10, 11)
  const sharedCircle = arrow(0, 9, 18)
  const crossesCircle = arrow(19, 9, 0)
  const crossesShaft = arrow(1, 9, 18)
  const clear = arrow(2, 3, 4)
  assert.deepEqual(selectReadableArrows([first, sharedCircle, crossesCircle, crossesShaft, clear], 12), [first, clear])
  assert.ok(hasReadableArrowLayout([first, clear]))
  assert.ok(!hasReadableArrowLayout([first, crossesShaft]))
  assert.ok(!hasReadableArrowLayout([arrow(0, 10, 1, 9)]))
})

test('the cap also applies to layouts with no crossings', () => {
  const independent = Array.from({ length: MAX_GENERATED_ARROWS + 1 }, (_, i) => arrow(3 * i, 3 * i + 1, 3 * i + 2))
  assert.equal(selectReadableArrows(independent, MAX_GENERATED_ARROWS).length, MAX_GENERATED_ARROWS)
  assert.ok(!hasReadableArrowLayout(independent))
})
