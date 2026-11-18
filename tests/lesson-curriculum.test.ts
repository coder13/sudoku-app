import assert from 'node:assert/strict'
import test from 'node:test'
import content from '../src/sudoku/learn-content.json' with { type: 'json' }
import { lessonCatalog, type LearnContent } from '../src/sudoku/lesson-content.ts'
import { validateContent } from '../tools/lesson-editor/validate.mjs'

const curriculum = content as LearnContent
const catalog = lessonCatalog(curriculum)

test('foundation concepts precede the techniques that first rely on them', () => {
  const requirements = {
    'full-house': 'cells-that-see',
    'locked-candidates': 'candidate-logic',
    'naked-subsets': 'counting-cells-and-digits',
    'hidden-subsets': 'counting-cells-and-digits',
    'x-wing': 'fish-basics',
    skyscraper: 'strong-weak-links',
    'xy-wing': 'bivalue-case-splits',
    'unique-rectangle': 'uniqueness-assumption',
    'simple-coloring': 'coloring-basics',
    '3d-medusa': 'coloring-basics',
    'wxyz-wing': 'almost-locked-set-basics',
    aic: 'chain-notation',
    'nice-loops': 'closed-chains',
    'grouped-aic': 'grouped-candidates',
    'almost-locked-sets': 'restricted-common-candidates',
    'als-aic': 'als-links',
    'forcing-chain': 'forcing-proof-basics',
    'multi-sector-locked-sets': 'house-digit-slots',
    'franken-fish': 'house-digit-slots',
    'pattern-overlay': 'digit-layouts',
    'pairwise-pattern-overlay': 'digit-layouts',
  }
  for (const [technique, foundation] of Object.entries(requirements)) {
    const lesson = catalog.lessonRoutes.get(technique)!
    const prerequisite = catalog.lessonRoutes.get(foundation)!
    assert.equal(prerequisite.kind, 'foundation', foundation)
    assert.ok(lesson.prerequisites?.includes(foundation), technique)
    assert.ok(catalog.articles.indexOf(prerequisite) < catalog.articles.indexOf(lesson), technique)
  }
  assert.equal(catalog.lessonRoutes.get('nested-proofs-and-search')?.difficulty, 'impossible')
})

test('every prerequisite names an earlier article in the course', () => {
  const positions = new Map(catalog.articles.map(({ id }, index) => [id, index]))
  for (const [index, article] of catalog.articles.entries()) {
    for (const prerequisite of article.prerequisites ?? []) {
      const position = positions.get(prerequisite)
      assert.ok(position !== undefined && position < index, `${article.id} requires ${prerequisite}`)
    }
  }
})

test('grouped techniques keep their URLs and move to Master after their foundations', () => {
  assert.equal(catalog.lessonRoutes.get('aic')?.difficulty, 'expert')
  assert.equal(catalog.lessonRoutes.get('nice-loops')?.difficulty, 'expert')
  assert.equal(catalog.lessonRoutes.get('grouped-aic')?.id, 'grouped-aic')
  for (const id of ['grouped-aic', 'grouped-continuous-nice-loop', 'grouped-discontinuous-nice-loop']) {
    assert.equal(catalog.lessonRoutes.get(id)?.difficulty, 'master', id)
  }
  assert.equal(new Set(catalog.articles.map(article => article.id)).size, catalog.articles.length)
})

test('the lesson editor saves the curriculum and rejects quiz blocks', () => {
  const examples = [...catalog.lessonExampleIds]
  assert.doesNotThrow(() => validateContent(curriculum, curriculum, examples))
  const invalid = structuredClone(curriculum)
  Object.assign(invalid.fundamentals.blocks[0], { type: 'concept-check' })
  assert.throws(() => validateContent(invalid, curriculum, examples), /unknown block type/)
})

test('foundation review practice cannot take over an existing technique route', () => {
  const withReview = structuredClone(curriculum)
  withReview.groups.flatMap(group => group.lessons).find(lesson => lesson.id === 'chain-basics')!.blocks.push({
    type: 'practice', drills: [{ example: 'naked-pair', title: 'Review Naked Pair' }],
  })
  assert.equal(lessonCatalog(withReview).lessonRoutes.get('naked-pair')?.id, 'naked-subsets')
})
