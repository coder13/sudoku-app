import type { Meta, StoryObj } from '@storybook/react-vite'
import { branchOriginMasks, branchRules } from '../../src/sudoku/branches'
import { valuesOf, type Game } from '../../src/sudoku/game'
import { playSession } from '../../src/sudoku/play-session'
import { starter } from '../support/fixtures'
import { seedRoom } from '../support/story-room'
import { defaultWorktableStoryArgs, WorktableExample } from '../support/worktable-example'

const cell = 10
const position = { values: valuesOf(starter) }
const origin = { ...position, candidateMasks: branchOriginMasks(position, branchRules()) }
const example: Game = { ...starter, id: 'story-branches', branchWorkspace: { nextNumber: 3, branches: [
  { id: 'first', number: 1, origin, history: [{ add: [{ cell, digit: 7, truth: true }], clear: [] }], cursor: 1 },
  { id: 'second', number: 2, origin, history: [
    { add: [{ cell, digit: 7, truth: false }], clear: [] },
    { add: [{ cell, digit: 4, truth: true }], clear: [] },
  ], cursor: 2 },
] } }

const meta = {
  title: 'Medium/Tools/Branches',
  component: WorktableExample,
  parameters: { layout: 'fullscreen' },
  args: { ...defaultWorktableStoryArgs, game: example, games: [example] },
  beforeEach: () => {
    seedRoom([example])
    playSession.set(example.id, 'toolPanels', { open: ['branches'], active: 'branches' })
  },
} satisfies Meta<typeof WorktableExample>
export default meta
type Story = StoryObj<typeof meta>

export const CompareOrEdit: Story = {}
export const NarrowWorkspace: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } }
