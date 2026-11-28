import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const hbr9 = JSON.parse(readFileSync(new URL('../fixtures/sudoku-coach-jigsaw-anti-royal.json', import.meta.url), 'utf8')) as {
  code: string
  solution: string
}
const terrain = JSON.parse(readFileSync(new URL('../fixtures/coach-terrain.json', import.meta.url), 'utf8')) as {
  source: { sudoku: string; solution: string }
}

const fixtures = [
  {
    name: 'published HBR9 mixed-rule import',
    code: hbr9.code,
    solution: hbr9.solution,
    ruleTypes: ['anti-knight', 'anti-king', 'non-consecutive'],
    techniqueOrder: ['naked-single', 'hidden-single', 'locked-candidates'],
    finderTechnique: 'locked-candidates',
  },
  {
    name: 'published D8HP Terrain import',
    code: terrain.source.sudoku,
    solution: terrain.source.solution,
    ruleTypes: ['terrain-sandwich'],
    techniqueOrder: ['sandwich'],
    finderTechnique: 'sandwich',
  },
]

for (const fixture of fixtures) {
  test(`${fixture.name} verifies through real Wasm workers during foreground and Finder traffic`, async ({ page }) => {
    await page.goto('/iframe.html?id=medium-grid-sudoku-grid--coach-cosmetic-line-artwork&viewMode=story&embed=true')

    const result = await page.evaluate(async ({ code, solution, expectedRuleTypes, techniqueOrder, finderTechnique }) => {
      const { prepareImportedPuzzle } = await import('/src/sudoku/puzzle-preview.ts')
      const { runEngine } = await import('/src/sudoku/engine.ts')
      const { watchTechniqueScan } = await import('/src/sudoku/technique-scan.ts')
      let importedRuleTypes: string[] = []
      let givens = ''
      const previewStart = performance.now()
      const preview = await prepareImportedPuzzle(code, [], {
        deferRating: true,
        onDecoded(puzzle) {
          const rules = puzzle.variant?.puzzle.rules ?? []
          importedRuleTypes = rules.map(rule => rule.type)
          givens = puzzle.variant?.puzzle.givens ?? ''
        },
      })
      const previewMs = performance.now() - previewStart
      if (!preview.game.variant) throw new Error('The published source did not import as a variant puzzle.')

      const hasExpectedRules = expectedRuleTypes.every(type => importedRuleTypes.includes(type))
      const position = { puzzle: preview.game.variant.puzzle }
      const values = '0'.repeat(81)
      const scanOrder = techniqueOrder
      const scan = watchTechniqueScan(values, undefined, position, undefined, scanOrder)
      const finderStart = performance.now()
      const finder = scan.count(finderTechnique)
      const foregroundStart = performance.now()
      const [candidates, hints] = await Promise.all([
        runEngine({ type: 'variant', operation: 'candidates', position }),
        runEngine({ type: 'variant', operation: 'hints', position, techniqueOrder: scanOrder, limit: 8 }),
      ])
      const foregroundMs = performance.now() - foregroundStart
      const finderCount = await finder
      const finderMs = performance.now() - finderStart
      scan.close()

      const solutionPreserved = preview.game.variant.solution === solution
      const candidatesPreserveSolution = candidates.every((mask, cell) =>
        givens[cell] !== '0' || Boolean(mask & (1 << (Number(solution[cell]) - 1))))
      return {
        previewMs, foregroundMs, finderMs, finderCount,
        hasExpectedRules, solutionPreserved, candidatesPreserveSolution,
        hintCount: hints.length,
      }
    }, {
      code: fixture.code,
      solution: fixture.solution,
      expectedRuleTypes: fixture.ruleTypes,
      techniqueOrder: fixture.techniqueOrder,
      finderTechnique: fixture.finderTechnique,
    })

    expect(result.hasExpectedRules).toBe(true)
    expect(result.solutionPreserved).toBe(true)
    expect(result.candidatesPreserveSolution).toBe(true)
    expect(result.hintCount).toBeGreaterThan(0)
    expect(result.finderCount).toBeGreaterThanOrEqual(0)
    console.log(`${fixture.name} real-worker timings: preview ${result.previewMs.toFixed(1)} ms; foreground hint+candidates ${result.foregroundMs.toFixed(1)} ms; concurrent Finder ${result.finderMs.toFixed(1)} ms.`)
  })
}
