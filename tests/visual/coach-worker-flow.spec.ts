import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const hbr9 = JSON.parse(readFileSync(new URL('../fixtures/sudoku-coach-jigsaw-anti-royal.json', import.meta.url), 'utf8')) as {
  code: string
  solution: string
}

test('published HBR9 import verifies through real Wasm workers during foreground and Finder traffic', async ({ page }) => {
  await page.goto('/iframe.html?id=medium-grid-sudoku-grid--coach-cosmetic-line-artwork&viewMode=story&embed=true')

  const result = await page.evaluate(async ({ code, solution }) => {
    const { prepareImportedPuzzle } = await import('/src/sudoku/puzzle-preview.ts')
    const { runEngine } = await import('/src/sudoku/engine.ts')
    const { watchTechniqueScan } = await import('/src/sudoku/technique-scan.ts')
    let imported: Awaited<ReturnType<typeof import('/src/sudoku/puzzle-import.ts').detectPuzzle>> | undefined
    const previewStart = performance.now()
    const preview = await prepareImportedPuzzle(code, [], {
      deferRating: true,
      onDecoded(puzzle) { imported = puzzle },
    })
    const previewMs = performance.now() - previewStart
    if (!imported?.variant) throw new Error('Published HBR9 did not import as a mixed-rule puzzle.')

    const rules = imported.variant.puzzle.rules ?? []
    const hasAntiRoyal = ['anti-knight', 'anti-king', 'non-consecutive'].every(type =>
      rules.some(rule => rule.type === type))
    const position = { puzzle: imported.variant.puzzle }
    const values = '0'.repeat(81)
    const scanOrder = ['naked-single', 'hidden-single', 'locked-candidates']
    const scan = watchTechniqueScan(values, undefined, position, undefined, scanOrder)
    const finderStart = performance.now()
    const finder = scan.count('locked-candidates')
    const foregroundStart = performance.now()
    const [candidates, hints] = await Promise.all([
      runEngine({ type: 'variant', operation: 'candidates', position }),
      runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: scanOrder, limit: 8 }),
    ])
    const foregroundMs = performance.now() - foregroundStart
    const finderCount = await finder
    const finderMs = performance.now() - finderStart
    scan.close()

    const solutionPreserved = preview.game.variant?.solution === solution
    const candidatesPreserveSolution = candidates.every((mask, cell) =>
      imported?.variant?.puzzle.givens[cell] !== '0' ||
      Boolean(mask & (1 << (Number(solution[cell]) - 1))))
    return {
      previewMs, foregroundMs, finderMs, finderCount,
      hasAntiRoyal, solutionPreserved, candidatesPreserveSolution,
      hintCount: hints.length,
    }
  }, { code: hbr9.code, solution: hbr9.solution })

  expect(result.hasAntiRoyal).toBe(true)
  expect(result.solutionPreserved).toBe(true)
  expect(result.candidatesPreserveSolution).toBe(true)
  expect(result.hintCount).toBeGreaterThan(0)
  expect(result.finderCount).toBeGreaterThanOrEqual(0)
  console.log(`HBR9 real-worker timings: preview ${result.previewMs.toFixed(1)} ms; foreground hint+candidates ${result.foregroundMs.toFixed(1)} ms; concurrent Finder ${result.finderMs.toFixed(1)} ms.`)
})
