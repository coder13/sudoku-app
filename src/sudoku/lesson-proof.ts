import type { Candidate, LessonExample } from './engine.ts'
import { candidateId } from './chains.ts'
import { applyDeduction, makeGame, replaceCandidates } from './game.ts'
import { cellName, houseName } from './lesson-diagram.ts'

export type LessonProofExample = Omit<LessonExample, 'practice'>

export type LessonProofStep = {
  candidate: Candidate
  truth: boolean
  causes: readonly number[]
  text: string
}

export function lessonForcingProof(example: LessonProofExample) {
  const { evidence, actions } = example.deduction
  if (!('tridagon' in evidence) || actions.length !== 1 || !('eliminate' in actions[0])) return
  const target = actions[0].eliminate
  const { branches, guardians } = evidence.tridagon
  if (branches.length < 2 || branches.length !== guardians.length) return

  const starts = new Set(guardians.map(candidateId))
  const proof: LessonProofStep[][] = []
  for (const { assumption, steps, conflict } of branches) {
    if (conflict || !assumption.truth || !starts.delete(candidateId(assumption.candidate))) return
    const end = steps.findIndex(({ effect }) => !effect.truth && candidateId(effect.candidate) === candidateId(target))
    if (end < 0) return
    const { digit, cell } = assumption.candidate
    proof.push([
      { ...assumption, causes: [], text: `Assume ${digit} in ${cellName(cell)}.` },
      ...steps.slice(0, end + 1).map(({ effect, scope, causes }) => {
        const { digit, cell } = effect.candidate
        const place = cellName(cell)
        const source = causes.length === 1 ? (causes[0] === 0 ? assumption : steps[causes[0] - 1].effect) : undefined
        let text = effect.truth ? `Place ${digit} in ${place}.` : `${place} loses ${digit}.`
        if (typeof scope === 'object' && 'house' in scope) {
          const house = houseName(scope.house.house)
          if (effect.truth) text += ` It’s the only place left for ${digit} in ${house}.`
          else if (source?.truth) text += ` ${digit} in ${cellName(source.candidate.cell)} rules it out in ${house}.`
        } else if (typeof scope === 'object' && 'cell' in scope) {
          if (effect.truth) text += ' It’s the only candidate left.'
          else if (source?.truth) text += ` The cell takes ${source.candidate.digit}.`
        }
        return { ...effect, causes, text }
      }),
    ])
  }
  return { target, branches: proof }
}

export function proofDependencies(steps: readonly LessonProofStep[], index: number): Set<number> {
  const dependencies = new Set<number>([index])
  for (let step = index; step >= 0; step--) {
    if (dependencies.has(step)) for (const cause of steps[step].causes) dependencies.add(cause)
  }
  return dependencies
}

export function copyLessonPosition(example: LessonProofExample, steps: readonly LessonProofStep[]) {
  const initial = makeGame('lesson-proof', 'Proof copy', example.givens, 'custom', 0)
  initial.position.entries = example.entries
  initial.position.eliminations = [...example.eliminations]
  const game = replaceCandidates(initial, example.candidates, { recordHistory: false })
  const position = steps.reduce((current, { candidate, truth }) => applyDeduction(current, [
    truth ? { place: candidate } : { eliminate: candidate },
  ], current.position.corner), game)
  return { ...position, past: [] }
}
