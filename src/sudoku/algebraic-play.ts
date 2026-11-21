import { algebraicPosition, type AlgebraicGame } from './algebraic-game.ts'
import { EngineError, runEngine, type AlgebraicStep, type HintChoice } from './engine.ts'
import { miniHintChoice, type MiniSolutionTrace } from './mini-play.ts'
import { MINI_RULE } from './new-puzzle.ts'

export const ALGEBRAIC_CAGE_TECHNIQUE = 'algebraic-cage-bounds'

export function algebraicRules(game: AlgebraicGame) {
  return game.source?.rulesText.split(/(?:^|\n)\* /).filter(Boolean) ?? [
    MINI_RULE,
    'The digits in each cage are distinct and add to the total shown in its top-left corner.',
    'Each letter stands for a positive integer. The same letter has the same value in every cage.',
  ]
}

function sumRange(lower: number, upper: number) {
  return lower === upper ? String(lower) : `${lower} through ${upper}`
}

function algebraicHintChoice({ rules }: AlgebraicGame, step: AlgebraicStep): HintChoice {
  if (step.type === 'house') return miniHintChoice(step.proof)
  const { target, actions, bounds, totalLower, totalUpper } = step.proof
  const cage = rules[target]
  const name = cage.total.type === 'variable' ? cage.total.name : undefined
  const sources = name ? rules.flatMap((rule, index) => {
    if (rule.total.type !== 'variable' || rule.total.name !== name) return []
    const { sumLower, sumUpper } = bounds.cages[index]
    return [`${rule.label} can total ${sumRange(sumLower, sumUpper)}.`]
  }) : []
  const description = name
    ? `${sources.join(' ')} ${name} is positive and has the same value in every cage, so ${name} can be ${sumRange(...bounds.variables[name])}.`
    : `The ${cage.label} cage must add to ${totalLower}.`
  const reason = `The ${cage.label} cage needs distinct digits with a total of ${sumRange(totalLower, totalUpper)}. No allowed combination uses a crossed-out candidate in its cell.`
  const candidates = actions.flatMap(action => 'eliminate' in action ? [action.eliminate] : [])
  return {
    actions, technique: ALGEBRAIC_CAGE_TECHNIQUE,
    evidence: { variant: { description, reason } },
    pattern: { houses: [], cells: [...cage.cells], candidates },
  }
}

export function analyzeAlgebraic(game: Pick<AlgebraicGame, 'rules'>, values: string, run = runEngine) {
  return run({ type: 'sized-variant', operation: 'analyze', position: algebraicPosition(game, values) })
}

export async function algebraicCandidates(game: AlgebraicGame, values: string, eliminations?: readonly number[], run = runEngine) {
  const result = await run({
    type: 'sized-variant', operation: 'hints', position: algebraicPosition(game, values), eliminations, limit: 0,
  })
  return result?.candidates ?? null
}

export function checkAlgebraicHintPosition(game: AlgebraicGame, values: string, eliminations?: readonly number[]) {
  if ([...values].some((digit, cell) => digit !== '0' && digit !== game.solution[cell])) {
    throw new EngineError('The placed digits conflict with this puzzle’s solution.', 'conflict')
  }
  if (eliminations?.some((mask, cell) => values[cell] === '0' && (mask & (1 << (Number(game.solution[cell]) - 1))))) {
    throw new EngineError('A required candidate is missing.', 'invalid-eliminations')
  }
}

export async function algebraicHintChoices(game: AlgebraicGame, values: string, eliminations?: readonly number[], run = runEngine) {
  checkAlgebraicHintPosition(game, values, eliminations)
  const result = await run({
    type: 'sized-variant', operation: 'hints', position: algebraicPosition(game, values), eliminations, limit: 256,
  })
  return result && { choices: result.choices.map(step => algebraicHintChoice(game, step)), candidates: result.candidates }
}

export async function algebraicSolutionTrace(game: AlgebraicGame, givens: string, run = runEngine): Promise<MiniSolutionTrace> {
  const trace = await run({ type: 'sized-variant', operation: 'trace', position: algebraicPosition(game, givens) })
  if (!trace?.length) throw new EngineError('The puzzle contains conflicting givens or rules.', 'conflict')
  const steps: HintChoice[] = []
  const positions = trace.map(({ digits, eliminations, candidates, step }) => {
    const choice = step && algebraicHintChoice(game, step)
    if (choice) steps.push(choice)
    return {
      givens, entries: digits.map((digit, cell) => givens[cell] === '0' ? digit : 0).join(''), eliminations,
      candidates, pattern: choice?.pattern,
    }
  })
  const board = trace[trace.length - 1].digits.join('')
  return { board, steps, positions, status: board === game.solution ? 'solved' : 'stalled' }
}
