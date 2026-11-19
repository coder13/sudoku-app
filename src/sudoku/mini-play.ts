import { EngineError, runEngine, type HintChoice, type LogicalSolution, type SizedClassicDeduction } from './engine.ts'
import { completeCandidateMasks, hintEliminations, valuesOf, type Game } from './game.ts'
import { MINI_GRID, sizedClassicPosition } from './grid.ts'
import { readDisabledHintTechniques } from './hint-preferences.ts'

export const MINI_TECHNIQUES = ['naked-single', 'hidden-single', 'pointing', 'claiming'] as const

export function analyzeMini(values: string) {
  return runEngine({ type: 'sized-classic', position: sizedClassicPosition(MINI_GRID, values), operation: 'analyze' })
}

export async function solveMini(values: string) {
  const result = await runEngine({ type: 'sized-classic', position: sizedClassicPosition(MINI_GRID, values), operation: 'solve' })
  return result?.join('') ?? null
}

export async function miniCandidates(values: string, eliminations?: readonly number[]) {
  const candidates = await runEngine({
    type: 'sized-classic', position: sizedClassicPosition(MINI_GRID, values), operation: 'candidates',
  })
  return candidates?.map((mask, cell) => mask & ~(eliminations?.[cell] ?? 0)) ?? null
}

function hintChoice(step: SizedClassicDeduction): HintChoice {
  const [source, target] = step.houses
  const cells = step.candidates.map(({ cell }) => cell)
  const pattern = { houses: step.houses, cells, candidates: step.candidates }
  const { actions } = step
  if (step.technique === 'locked-candidate') {
    return { technique: 'box' in source ? 'pointing' : 'claiming', evidence: { intersection: { source, target, cells } }, pattern, actions }
  }
  return step.technique === 'hidden-single'
    ? { technique: step.technique, evidence: { house: source }, pattern, actions }
    : { technique: step.technique, evidence: { cell: cells[0] }, pattern, actions }
}

export async function miniHintChoices(values: string, eliminations?: readonly number[], run = runEngine) {
  const hints = await run({
    type: 'sized-classic', position: sizedClassicPosition(MINI_GRID, values), operation: 'hints', eliminations, limit: 256,
  })
  return hints && { choices: hints.choices.map(hintChoice), candidates: hints.candidates }
}

export async function miniHints(game: Game, limit: 10 | 'all', technique?: string) {
  const values = valuesOf(game)
  const eliminations = hintEliminations(values, completeCandidateMasks(game), game.position.eliminations, MINI_GRID.size)
  const solution = await solveMini(game.givens)
  if (!solution || [...values].some((digit, cell) => digit !== '0' && digit !== solution[cell])) {
    throw new EngineError('The placed digits conflict with this puzzle’s solution.', 'conflict')
  }
  if (eliminations?.some((mask, cell) => values[cell] === '0' && (mask & (1 << (Number(solution[cell]) - 1))))) {
    throw new EngineError('A required candidate is missing.', 'invalid-eliminations')
  }
  const result = await miniHintChoices(values, eliminations)
  if (!result) throw new EngineError('Check the current digits and candidates.', 'conflict')
  const disabled = readDisabledHintTechniques()
  const available = result.choices.filter(step => technique ? step.technique === technique : !disabled.includes(step.technique))
  const choices = limit === 'all' ? available : available.slice(0, limit)
  return { choices, available: available.length, candidates: result.candidates }
}

export type MiniSolutionTrace = Omit<LogicalSolution, 'rating'> & { status: 'solved' | 'stalled' }

export async function miniSolutionTrace(givens: string): Promise<MiniSolutionTrace> {
  const trace = await runEngine({ type: 'sized-classic', position: sizedClassicPosition(MINI_GRID, givens), operation: 'trace' })
  if (!trace?.length) throw new EngineError('The puzzle contains conflicting givens.', 'conflict')
  const steps: HintChoice[] = []
  const positions = trace.map(({ digits, eliminations, candidates, deduction }) => {
    const step = deduction && hintChoice(deduction)
    if (step) steps.push(step)
    return {
      givens, entries: digits.map((digit, cell) => givens[cell] === '0' ? digit : 0).join(''), eliminations,
      candidates, pattern: step?.pattern,
    }
  })
  const board = trace[trace.length - 1].digits.join('')
  return { board, steps, positions, status: board.includes('0') ? 'stalled' : 'solved' }
}

export async function miniSingles(values: string, eliminations?: readonly number[], displayedCandidates?: readonly number[]) {
  const removed = hintEliminations(values, displayedCandidates ?? null, eliminations, MINI_GRID.size)
  const trace = await runEngine({
    type: 'sized-classic', position: sizedClassicPosition(MINI_GRID, values), operation: 'trace', eliminations: removed, singlesOnly: true,
  })
  return trace?.at(-1)?.digits.join('') ?? values
}
