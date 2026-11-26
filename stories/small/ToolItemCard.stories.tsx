import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from '../../src/components/Button'
import { ToolItemCard } from '../../src/components/ToolItemCard'
import { almostLockedSetColor } from '../../src/sudoku/als-highlighting'

const meta = {
  title: 'Small/Play/ToolItemCard',
  component: ToolItemCard,
  args: {
    name: 'Chain 1',
    colors: ['#214b9c', '#a44b15'],
    selected: true,
    onSelect: fn(),
    visibility: { label: 'Hide chain 1', disabled: true, onClick: fn() },
    remove: { label: 'Delete chain 1', disabled: true, onClick: fn() },
    editor: { label: 'Edit chain 1', content: <Button variant="quiet" disabled>End path</Button> },
  },
  render: args => <ul className="tool-item-list" style={{ maxWidth: 300 }}><ToolItemCard {...args} /></ul>,
} satisfies Meta<typeof ToolItemCard>

export default meta
type Story = StoryObj<typeof meta>

export const EmptyChain: Story = {}

export const SelectedSubset: Story = {
  args: {
    name: 'Set 1',
    typeLabel: 'ALS',
    subtitle: { text: '2479', description: 'Candidates 2, 4, 7, 9' },
    colors: [almostLockedSetColor(0)],
    edit: { label: 'Edit Set 1', onClick: fn() },
    visibility: { label: 'Hide Set 1', onClick: fn() },
    remove: { label: 'Delete Set 1', onClick: fn() },
    editor: { label: 'Set 1 details', content: <span>Cells r3c5, r3c7, r3c8</span> },
  },
}

export const HiddenSubset: Story = {
  args: {
    ...SelectedSubset.args,
    selected: false,
    hidden: true,
    visibility: { label: 'Show Set 1', onClick: fn() },
  },
}
