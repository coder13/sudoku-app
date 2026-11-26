import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingOption } from '../../src/components/SettingOption'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Settings/SettingOption',
  component: SettingOption,
  args: {
    name: 'candidate-layout', value: 'grid', label: 'Grid',
    description: 'Use fixed positions in a 3×3 grid.', checked: true, onSelect: () => {},
  },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [selected, setSelected] = useState(args.checked ? args.value : 'center-corner')
    return <fieldset>
      <legend>Candidate layout</legend>
      <SettingOption {...args} checked={selected === args.value} onSelect={() => { args.onSelect(); setSelected(args.value) }} />
      <SettingOption name={args.name} value="center-corner" label="Center and corner"
        description="Place candidates in cell centers or corners." checked={selected === 'center-corner'}
        onSelect={() => setSelected('center-corner')} />
    </fieldset>
  },
} satisfies Meta<typeof SettingOption>
export default meta
type Story = StoryObj<typeof meta>

export const CandidateLayout: Story = {}
