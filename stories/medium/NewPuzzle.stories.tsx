import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NewPuzzle } from '../../src/components/PuzzleDialogs'
import { DialogStory } from '../support/frames'

const meta = {
  title: 'Medium/Dialogs/New puzzle',
  component: NewPuzzle,
  tags: ['!autodocs'],
  args: { close: fn(), difficulty: 'easy', onDifficultyChange: fn(), onCreate: fn() },
  render: (args) => {
    const [difficulty, setDifficulty] = useState(args.difficulty)
    return <DialogStory label="New puzzle">{(close) =>
      <NewPuzzle difficulty={difficulty} close={() => { args.close(); close() }}
        onCreate={args.onCreate}
        onDifficultyChange={(value) => { args.onDifficultyChange(value); setDifficulty(value) }} />
    }</DialogStory>
  },
} satisfies Meta<typeof NewPuzzle>
export default meta
type Story = StoryObj<typeof meta>
export const Easy: Story = {}
export const Extreme: Story = { args: { difficulty: 'extreme' } }
