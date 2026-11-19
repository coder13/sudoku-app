import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { VariantRulesetSelector } from '../../src/components/VariantRulesetSelector'
import type { GenerationRulesetId } from '../../src/sudoku/variant-rulesets'
const meta = {
  title: 'Design system/Variant rulesets', component: VariantRulesetSelector,
  args: { variant: 'whispers', value: 'german', onChange: fn() },
  parameters: { docs: { description: { component: 'Choose a generation preset and pass its ID to both VariantPreview and generation. Native radio inputs support arrows, focus and a disabled generation state.' } } },
} satisfies Meta<typeof VariantRulesetSelector>
export default meta
type Story = StoryObj<typeof meta>
export const German: Story = {}
export const Dutch: Story = { args: { value: 'dutch' } }
export const Disabled: Story = { args: { value: 'dutch', disabled: true } }
export const Narrow: Story = {
  render: () => <div style={{ width: 260 }}><Example /></div>,
}
function Example() {
  const [value, setValue] = useState<GenerationRulesetId>('german')
  return <VariantRulesetSelector variant="whispers" value={value} onChange={setValue} />
}
