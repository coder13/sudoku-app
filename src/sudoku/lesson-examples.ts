import type { LessonExample, PracticeExercise, VariantPracticeExercise, VariantPuzzle } from './engine.ts'
import { cellName } from './lesson-diagram.ts'
import { variantHintChoice } from './variant-hints.ts'
import { nonConsecutiveDescription } from './variants.ts'

export type LessonExercise = PracticeExercise & { variantPuzzle?: VariantPuzzle }
type LessonDiagramExample = Omit<LessonExample, 'practice'> & { practice: LessonExercise; variantPuzzle?: VariantPuzzle }
export type EngineLessonExample = LessonExample | (VariantPracticeExercise & { practice: VariantPracticeExercise })

export function variantLessonExercise({ position, deduction, ...exercise }: VariantPracticeExercise): LessonExercise {
  const { puzzle, entries, eliminations } = position
  const { pattern, ...hint } = variantHintChoice(deduction, puzzle)
  if (pattern && 'domains' in deduction.evidence) {
    const { domains } = deduction.evidence
    const cells = deduction.evidence.type === 'locked-digit' ? deduction.evidence.clue.cells : deduction.evidence.cells
    pattern.candidates = cells.flatMap((cell, index) => {
      const active = exercise.candidates[cell] & domains[index]
      return Array.from({ length: 9 }, (_, digit) => digit + 1)
        .filter((digit) => active & (1 << (digit - 1))).map((digit) => ({ cell, digit }))
    })
  }
  if (pattern && deduction.evidence.type === 'exclusion') {
    const { premise } = deduction.evidence
    pattern.candidates = premise.type === 'cell'
      ? Array.from({ length: 9 }, (_, index) => index + 1)
        .filter(digit => premise.domain & 1 << (digit - 1)).map(digit => ({ cell: premise.cell, digit }))
      : premise.cells.map(cell => ({ cell, digit: premise.digit }))
  }
  return { ...exercise, givens: puzzle.givens, entries, eliminations: [...eliminations], deduction: hint, pattern, variantPuzzle: puzzle }
}

export function lessonExample(example: EngineLessonExample): LessonDiagramExample {
  if (!('position' in example)) return example
  const { practice, ...diagram } = example
  return { ...variantLessonExercise(diagram), practice: variantLessonExercise(practice) }
}

/** Give the learner the exact clues that the board does not draw. */
export function variantLessonClues(puzzle: VariantPuzzle) {
  const path = (cells: readonly number[]) => cells.map(cellName).join(' → ')
  const cells = (indices: readonly number[]) => indices.map(cellName).join(', ')
  return (puzzle.rules ?? []).flatMap((rule) => {
    switch (rule.type) {
      case 'parity': return [`${rule.parity === 'odd' ? 'Odd' : 'Even'} cells · ${cells(rule.cells)}`]
      case 'anti-knight': return ['Cells a knight’s move apart must differ.']
      case 'anti-king': return ['Cells touching at a corner must differ.']
      case 'non-consecutive': return [nonConsecutiveDescription(puzzle, rule)]
      case 'consecutive-run': return [`${rule.fromBulb ? 'Consecutive Thermometer' : 'Consecutive Line'} · ${path(rule.cells)}`]
      case 'inside-grid': return [`Inside Grid · ${rule.rows.length} × ${rule.rows.length}`]
      case 'distinct-cells': return [`Different digits · ${cells(rule.cells)}`]
      case 'inequality': return [`${cellName(rule.less)} < ${cellName(rule.greater)}`]
      case 'adjacent-total': return [`Total ${rule.sum} · ${cells(rule.cells)}`]
      case 'clone': return rule.groups.map((group) => `Same digit · ${cells(group)}`)
      case 'kropki': return [
        ...(rule.consecutive?.negative ? ['All white dots are given.'] : []),
        ...(rule.ratioTwo?.negative ? ['All black dots are given.'] : []),
      ]
      case 'xv': return ([['V', rule.five], ['X', rule.ten]] as const).flatMap(([label, marks]) => [
        ...(marks?.pairs ?? []).map((pair) => `${label} · ${cells(pair)}`),
        ...(marks?.negative ? [`All ${label} marks are given.`] : []),
      ])
      case 'palindrome': return [`Palindrome · ${path(rule.cells)}`]
      case 'between': return [`Between line · ${path(rule.cells)}`]
      case 'pill-arrow': return [`Pill at ${cells(rule.pill)} · Arrow ${path(rule.cells)}`]
      case 'lockout': return [`Lockout line · ${path(rule.cells)}`]
      case 'whispers': return [`Whispers line · ${path(rule.cells)}. Minimum difference ${rule.minDifference}.`]
      case 'entropic': return [`Entropic line · ${path(rule.cells)}. Every three positions use low, medium and high digits.`]
      case 'modular': return [`Modular line · ${path(rule.cells)}. Every three positions use one digit from each group {1, 4, 7}, {2, 5, 8} and {3, 6, 9}.`]
      case 'renban': return [`Renban line · ${path(rule.cells)}`]
      case 'region-sum': return [`Region Sum line · ${path(rule.cells)}${rule.groupByRegion ? '. Combine visits to the same region.' : ''}`]
      case 'little-killer': return [`Little Killer ${rule.sum} · ${path(rule.cells)}`]
      case 'skyscrapers': return [`Skyscrapers ${rule.count} · ${path(rule.cells)}`]
      case 'sandwich': return [`Sandwich ${rule.sum} · ${path(rule.cells)}`]
      case 'x-sum': return [`X-sum ${rule.sum} · ${path(rule.cells)}`]
      default: return []
    }
  })
}
