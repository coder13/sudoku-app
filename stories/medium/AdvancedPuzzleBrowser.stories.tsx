import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { AdvancedPuzzleBrowser } from '../../src/components/AdvancedPuzzleBrowser'
import type { Game } from '../../src/sudoku/game'
import { namedDraft, solved, starter } from '../support/fixtures'
import { Width } from '../support/frames'

const meta = {
  title: 'Medium/Puzzles/Advanced puzzle browser',
  component: AdvancedPuzzleBrowser,
  args: {
    games: [starter, namedDraft, solved],
    active: starter.id,
    view: 'active',
    onViewChange: fn(),
    onSelect: fn(),
    onNew: fn(),
    onImport: fn(),
    onSave: fn(),
    onSavePuzzle: fn(),
    onUnsavePuzzle: fn(),
    onArchivePuzzle: fn(),
    onRestorePuzzle: fn(),
  },
  decorators: [(Story) => <Width width={720}><div className="surface"><Story /></div></Width>],
} satisfies Meta<typeof AdvancedPuzzleBrowser>
export default meta
type Story = StoryObj<typeof meta>

export const RowActionsAcrossViews: Story = {
  render: (args) => {
    const [games, setGames] = useState<Game[]>(args.games)
    const [active, setActive] = useState<string | null>(args.active)
    const [view, setView] = useState(args.view)
    const update = (id: string, change: (game: Game) => Game) => {
      setGames(current => current.map(game => game.id === id ? change(game) : game))
    }

    return <AdvancedPuzzleBrowser {...args} games={games} active={active} view={view}
      onViewChange={next => { args.onViewChange(next); setView(next) }}
      onSelect={id => { args.onSelect(id); setActive(id) }}
      onSavePuzzle={id => { args.onSavePuzzle(id); update(id, game => ({ ...game, savedForLater: true })) }}
      onUnsavePuzzle={id => { args.onUnsavePuzzle(id); update(id, game => ({ ...game, savedForLater: undefined })) }}
      onArchivePuzzle={id => { args.onArchivePuzzle(id); update(id, game => ({ ...game, archived: true })) }}
      onRestorePuzzle={id => { args.onRestorePuzzle(id); update(id, game => ({ ...game, archived: false })) }} />
  },
}
