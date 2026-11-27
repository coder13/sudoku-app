import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { branchOriginMasks, branchRules } from '../../src/sudoku/branches'
import { makeGame, replaceCandidates, valuesOf, type Game } from '../../src/sudoku/game'
import { playPreferenceStore } from '../../src/sudoku/play-preferences'
import { defaultDigitHighlight, playSession } from '../../src/sudoku/play-session'
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

const proofValues = '0'.repeat(81)
const proofMasks = Array<number>(81).fill(511)
for (let cell = 2; cell < 9; cell++) proofMasks[cell] &= ~(1 << 6)
proofMasks[80] = 1 << 3
const proofOrigin = { values: proofValues, candidateMasks: proofMasks }
const proofGame: Game = {
  ...replaceCandidates(makeGame('story-branch-proof', 'Branch deductions', proofValues, 'imported', 0), proofMasks, { recordHistory: false }),
  branchWorkspace: { nextNumber: 4, branches: [
    { cell: 0, digit: 7, truth: true }, { cell: 1, digit: 7, truth: true }, { cell: 80, digit: 4, truth: false },
  ].map((move, index) => ({ id: `${index + 1}`, number: index + 1, origin: proofOrigin, history: [{ add: [move], clear: [] }], cursor: 1 })) },
}

const meta = {
  title: 'Medium/Tools/Branches',
  component: WorktableExample,
  parameters: { layout: 'fullscreen' },
  args: { ...defaultWorktableStoryArgs, game: example, games: [example] },
  beforeEach: ({ args }) => {
    seedRoom([args.game])
    playSession.set(args.game.id, 'toolPanels', { open: ['branches'], active: 'branches' })
    playSession.set(args.game.id, 'digitHighlight', defaultDigitHighlight)
  },
} satisfies Meta<typeof WorktableExample>
export default meta
type Story = StoryObj<typeof meta>

export const CompareOrEdit: Story = {}
export const NarrowWorkspace: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } }
export const ComparisonEliminations: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Compare branches' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Branch display options' }))
    const toggle = canvas.getByRole('menuitemcheckbox', { name: 'Show eliminations' })
    const cell = canvas.getByRole('gridcell', { name: /^Row 2, column 2,/ })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(cell).toHaveAccessibleName(/7 placed in branch A/)
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(cell).toHaveAccessibleName(/7 placed in branch A, removed in the comparison/)
    await expect(canvas.getByRole('button', { name: 'Apply edits' })).toBeDisabled()
  },
}
export const AppliesProvedEdits: Story = {
  args: { game: proofGame, games: [proofGame] },
  play: async ({ canvas, userEvent }) => {
    const apply = canvas.getByRole('button', { name: 'Apply edits' })
    const peer = canvas.getByRole('gridcell', { name: /^Row 2, column 3,/ })
    const single = canvas.getByRole('gridcell', { name: /^Row 9, column 9,/ })
    await userEvent.click(canvas.getByRole('button', { name: 'Compare branches' }))
    await expect(apply).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Branch display options' }))
    await userEvent.click(canvas.getByRole('menuitemcheckbox', { name: 'Show eliminations' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(apply)
    await expect(peer).toHaveAccessibleName(/candidates 1 2 3 4 5 6 8 9/)
    await expect(single).toHaveAccessibleName(/digit 4/)
    await expect(canvas.getByRole('gridcell', { name: /^Row 1, column 1,/ })).toHaveAccessibleName(/candidates 1 2 3 4 5 6 7 8 9/)
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect(peer).toHaveAccessibleName(/candidates 1 2 3 4 5 6 7 8 9/)
    await expect(single).toHaveAccessibleName(/empty/)
  },
}
export const KeepsDigitHighlight: Story = {
  beforeEach: () => {
    const previous = playPreferenceStore.getSnapshot().selectedDigit
    playPreferenceStore.set('selectedDigit', 7)
    return () => playPreferenceStore.set('selectedDigit', previous)
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Branch display options' }))
    await userEvent.click(canvas.getByRole('menuitemcheckbox', { name: 'Show eliminations' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getByRole('button', { name: 'New branch' }))
    await expect(canvas.getByRole('gridcell', { name: /^Row 2, column 2.*highlighted for candidate 7/ })).toBeVisible()
    const peer = canvas.getByRole('gridcell', { name: /^Row 2, column 3,/ })
    await expect(peer).toHaveAccessibleName(/highlighted for candidate 7/)
    await userEvent.click(canvas.getByRole('gridcell', { name: /^Row 2, column 2,/ }))
    await userEvent.keyboard('7')
    await expect(peer).toHaveAccessibleName(/7 Ruled out in this branch/)
    await expect(peer).not.toHaveAccessibleName(/highlighted for candidate 7/)
  },
}
