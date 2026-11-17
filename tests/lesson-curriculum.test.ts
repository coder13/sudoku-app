import assert from 'node:assert/strict'
import test from 'node:test'
import content from '../src/sudoku/learn-content.json' with { type: 'json' }
import { lessonCatalog, type LearnContent } from '../src/sudoku/lesson-content.ts'
import { validateContent } from '../tools/lesson-editor/validate.mjs'

const curriculum = content as LearnContent
const catalog = lessonCatalog(curriculum)

test('foundation concepts precede the techniques that first rely on them', () => {
  const requirements = {
    'locked-candidates': 'candidate-logic',
    skyscraper: 'strong-weak-links',
    'xy-wing': 'bivalue-case-splits',
    'unique-rectangle': 'uniqueness-assumption',
    'simple-coloring': 'chain-basics',
    'wxyz-wing': 'almost-locked-set-basics',
    aic: 'chain-notation',
    'grouped-aic': 'grouped-candidates',
    'almost-locked-sets': 'restricted-common-candidates',
    'forcing-chain': 'forcing-proof-basics',
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

test('grouped techniques keep their URLs and move to Master after their foundations', () => {
  assert.equal(catalog.lessonRoutes.get('aic')?.difficulty, 'expert')
  assert.equal(catalog.lessonRoutes.get('nice-loops')?.difficulty, 'expert')
  assert.equal(catalog.lessonRoutes.get('grouped-aic')?.id, 'grouped-aic')
  for (const id of ['grouped-aic', 'grouped-continuous-nice-loop', 'grouped-discontinuous-nice-loop']) {
    assert.equal(catalog.lessonRoutes.get(id)?.difficulty, 'master', id)
  }
  assert.equal(new Set(catalog.articles.map(article => article.id)).size, catalog.articles.length)
})

test('all concept questions and tables can be saved by the lesson editor', () => {
  assert.doesNotThrow(() => validateContent(curriculum, curriculum, [...catalog.lessonExampleIds]))
  for (const article of catalog.articles.filter(article => article.kind === 'foundation')) {
    const check = article.blocks.find(block => block.type === 'concept-check')
    assert.ok(check, article.id)
    assert.ok(check.questions.length >= 2, article.id)
    for (const question of check.questions) assert.equal(new Set(question.options).size, question.options.length)
  }
  const invalid = structuredClone(curriculum)
  const question = invalid.groups.flatMap(group => group.lessons).flatMap(lesson => lesson.blocks)
    .find(block => block.type === 'concept-check')!
  question.questions[0].answer = 99
  assert.throws(() => validateContent(invalid, curriculum, [...catalog.lessonExampleIds]), /valid answers/)
})

test('foundation review practice cannot take over an existing technique route', () => {
  const withReview = structuredClone(curriculum)
  withReview.groups.flatMap(group => group.lessons).find(lesson => lesson.id === 'chain-basics')!.blocks.push({
    type: 'practice', drills: [{ example: 'naked-pair', title: 'Review Naked Pair' }],
  })
  assert.equal(lessonCatalog(withReview).lessonRoutes.get('naked-pair')?.id, 'naked-subsets')
})
