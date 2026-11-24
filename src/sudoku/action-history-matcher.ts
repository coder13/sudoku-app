import { matchingTechnique, type ActionMatcher } from './action-history.ts'
import { classifyActionTechniques, variantActionProofs } from './action-classification.ts'
import { runEngine, type DeductionAction, type EngineRunner } from './engine.ts'
import type { SizedGrid } from './grid.ts'
import { sizedRuleHintChoices } from './sized-rule-play.ts'
import type { SizedRuleGame } from './sized-rule-game.ts'
import { miniHintChoices } from './mini-play.ts'
import type { VariantGame } from './variants.ts'

export function actionHistoryMatcher(variant?: VariantGame, run: EngineRunner = runEngine, grid?: SizedGrid,
  sized?: SizedRuleGame, practiceTechnique?: string): ActionMatcher {
  type Proof = { technique: string; actions: readonly DeductionAction[] }
  type Position = Parameters<ActionMatcher>[0]
  const positions = new Map<Position, Promise<Proof[]>>()

  async function classicProofs(position: Position, techniqueOrder: readonly string[]): Promise<Proof[]> {
    const matches = await run({ type: 'deductions', ...position, techniqueOrder })
    return matches.flatMap(({ actions, proofs }) => proofs.map(({ technique }) => ({ technique, actions })))
  }

  async function proofsAt(position: Position, actions: readonly DeductionAction[]): Promise<Proof[]> {
    if (sized && grid) return (await sizedRuleHintChoices(sized, grid, position.values, position.eliminations, run))?.choices ?? []
    if (grid?.size === 4) return (await miniHintChoices(position.values, position.eliminations, run))?.choices ?? []

    // A move can have several valid proofs. Check the practiced technique before the normal solve order.
    const practiceProofs = !practiceTechnique ? [] : variant
      ? await variantActionProofs(position, variant, run, practiceTechnique)
      : await classicProofs(position, [practiceTechnique])
    if (matchingTechnique(actions, practiceProofs)) return practiceProofs
    if (variant) return [...practiceProofs, ...await variantActionProofs(position, variant, run)]
    const techniques = await classifyActionTechniques(position, actions, undefined, run)
    const order = [...new Set(techniques.filter((technique): technique is string => technique !== null))]
    if (!order.length) return practiceProofs
    if (actions.length === 1) return [...practiceProofs, { technique: order[0], actions }]
    // Equal technique names alone do not prove that the moves share one pattern.
    return [...practiceProofs, ...await classicProofs(position, order)]
  }
  return async (position, actions) => {
    // Prefix matching reuses the same proof scan, even for a long drag stroke.
    if (!positions.has(position)) positions.set(position, proofsAt(position, actions))
    return matchingTechnique(actions, await positions.get(position)!)
  }
}
