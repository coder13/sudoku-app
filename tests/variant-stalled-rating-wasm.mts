import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasUniquenessProof } from '../src/sudoku/game.ts'
import { prepareImportedPuzzle } from '../src/sudoku/puzzle-preview.ts'
import { puzzleGradeIsStale } from '../src/sudoku/puzzle-rating.ts'
import { hasPrintedKropki } from '../src/sudoku/variants.ts'
import { useWasmWorker } from './helpers/wasm-worker.ts'

useWasmWorker()

const code = 'SCv7_32_f2e9b4md9r1j0444rtisust8vvhloebitg8vao1ldqod9eklccgk353n4u0l4kd22jjud5du366nf9t76q2mc6pu7jahdl466sfpvjlhpf4ob61rl9fnk2gdqlm07infiu8i45rjf27a2ved0jl7ouvirvg6t6ji1qohr9ru31o5bckr6ashpjnnkaffdvjojhf54g6aq7hu54hrv7md7p3iinafpive0vahp6klk5e87apiihcr1agc2kdc55519911a1kg2pp5662083oc400698bis2tce2mlkg9v69euk0lvemggj1s39svetvai4628560nsabqspnntf9p1st35jpgcr7ugk3rh0apoddsortp9jlglilev5m0bcc6ctg6nongm45e4fvutu8nfgp7mjd6sk8'

test('a uniquely verified mixed-rule puzzle gets a rating when logical techniques stall', async () => {
  const { game, grade } = await prepareImportedPuzzle(code)

  assert.ok(game.variant)
  assert.ok(hasUniquenessProof(game))
  assert.notEqual(game.nonUnique, true)
  assert.ok(game.variant.puzzle.rules?.some(rule => rule.type === 'anti-knight'))
  assert.ok(hasPrintedKropki(game.variant.puzzle.rules))
  assert.deepEqual([grade?.difficulty, grade?.points, grade?.scoringVersion], ['impossible', 6132, 24])
  assert.deepEqual([game.difficulty, game.score, game.variantRatingVersion], ['impossible', 6132, 22])

  const previousGrade = { ...game, variantRatingVersion: 21 }
  assert.ok(puzzleGradeIsStale(previousGrade))
})
