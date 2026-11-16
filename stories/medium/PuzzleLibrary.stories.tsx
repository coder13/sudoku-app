import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PuzzleLibrary } from '../../src/components/PuzzleLibrary'
import { namedDraft, solved, starter } from '../support/fixtures'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Puzzles/Puzzle library',
  component: PuzzleLibrary,
  args: { games: [starter, namedDraft, solved], active: starter.id, onSelect: fn() },
  decorators: [(Story) => <Width width={460}><div className="surface"><Story /></div></Width>],
} satisfies Meta<typeof PuzzleLibrary>
export default meta
type Story = StoryObj<typeof meta>

export const InProgressDraftAndSolved: Story = {
  render: (args) => {
    const [active, setActive] = useState(args.active)
    return <PuzzleLibrary {...args} active={active} onSelect={(id) => { args.onSelect(id); setActive(id) }} />
  },
}
export const NoActivePuzzle: Story = { args: { active: null } }
