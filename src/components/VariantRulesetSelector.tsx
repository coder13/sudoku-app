import { useId } from 'react'
import { generationRuleset, generationRulesets, type GenerationRulesetId } from '../sudoku/variant-rulesets'
import type { VariantId } from '../sudoku/variants'

/** Choose a named rule preset before generation; native radio inputs retain keyboard semantics. */
export function VariantRulesetSelector({ variant, value, disabled, onChange }: {
  variant: VariantId
  value?: GenerationRulesetId
  disabled?: boolean
  onChange: (value: GenerationRulesetId) => void
}) {
  const id = useId()
  const choices = generationRulesets(variant), selected = generationRuleset(variant, value)
  if (!choices.length) return null
  return <fieldset className="variant-ruleset-selector" disabled={disabled}>
    <legend>Ruleset</legend>
    {choices.map(choice => <label key={choice.id}>
      <input type="radio" name={id} value={choice.id} checked={selected?.id === choice.id}
        aria-labelledby={`${id}-${choice.id}`} aria-describedby={`${id}-${choice.id}-rule`}
        onChange={() => onChange(choice.id)} />
      <span><strong id={`${id}-${choice.id}`}>{choice.name}</strong>
        <small id={`${id}-${choice.id}-rule`}>{choice.rule}</small></span>
    </label>)}
  </fieldset>
}
