import type { VariantPuzzle } from './engine.ts'
import type { VariantId } from './variants.ts'

const whispersRulesets = [
  { id: 'german', name: 'German Whispers', minDifference: 5,
    rule: 'Digits in neighboring cells along each line differ by at least 5.' },
  { id: 'dutch', name: 'Dutch Whispers', minDifference: 4,
    rule: 'Digits in neighboring cells along each line differ by at least 4.' },
] as const

export type GenerationRulesetId = typeof whispersRulesets[number]['id']
export type VariantGenerationOptions = { ruleset?: GenerationRulesetId; miracle?: boolean; signal?: AbortSignal }

export function generationRulesets(variant: VariantId | undefined) {
  return variant === 'whispers' ? whispersRulesets : []
}

export function isGenerationRulesetId(variant: VariantId, value: unknown): value is GenerationRulesetId {
  return generationRulesets(variant).some(ruleset => ruleset.id === value)
}

/** Resolve a saved/selected preset; families without presets retain their existing behavior. */
export function generationRuleset(variant: VariantId | undefined, preferred?: unknown) {
  const choices = generationRulesets(variant)
  return choices.find(ruleset => ruleset.id === preferred) ?? choices[0]
}

/** Retain a pure published/generated style when asking for the next puzzle. */
export function puzzleGenerationRuleset(puzzle: VariantPuzzle | undefined): GenerationRulesetId | undefined {
  const lines = puzzle?.rules?.filter(rule => rule.type === 'whispers')
  return lines?.length ? whispersRulesets.find(ruleset => lines.every(line =>
    line.minDifference === ruleset.minDifference))?.id : undefined
}
