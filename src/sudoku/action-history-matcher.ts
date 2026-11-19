import { matchingTechnique, type ActionMatcher } from './action-history.ts'
import { runEngine, type DeductionAction } from './engine.ts'
import type { MiniGrid } from './grid.ts'
import { miniHintChoices } from './mini-play.ts'
import { getVariantPlayOrder } from './variant-play.ts'
import type { VariantGame } from './variants.ts'

export function actionHistoryMatcher(variant?: VariantGame, run: typeof runEngine = runEngine, grid?: MiniGrid): ActionMatcher {
  type Proof = { technique: string; actions: readonly DeductionAction[] }
  const positions = new Map<Parameters<ActionMatcher>[0], Promise<Proof[]>>()
  async function proofsAt(position: Parameters<ActionMatcher>[0], actions: readonly DeductionAction[]): Promise<Proof[]> {
    if (grid) return (await miniHintChoices(position.values, position.eliminations, run))?.choices ?? []
    if (variant) {
      const proofs = await run({
        type: 'variant', operation: 'hints',
        position: { puzzle: variant.puzzle, entries: position.values, eliminations: position.eliminations },
        techniqueOrder: await getVariantPlayOrder(), limit: 64,
      }, { background: true })
      return proofs
    }
    const techniques = await run({ type: 'classify-actions', ...position, actions })
    const order = [...new Set(techniques.filter((technique): technique is string => technique !== null))]
    if (!order.length) return []
    if (actions.length === 1) return [{ technique: order[0], actions }]
    // Equal technique names alone do not prove that the moves share one pattern.
    const matches = await run({ type: 'deductions', ...position, techniqueOrder: order })
    return matches.flatMap(({ actions, proofs }) => proofs.map(({ technique }) => ({ technique, actions })))
  }
  return async (position, actions) => {
    // Prefix matching reuses the same proof scan, even for a long drag stroke.
    if (!positions.has(position)) positions.set(position, proofsAt(position, actions))
    return matchingTechnique(actions, await positions.get(position)!)
  }
}
