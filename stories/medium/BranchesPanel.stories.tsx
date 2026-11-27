import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Board } from '../../src/components/Board'
import { BranchesPanel } from '../../src/components/BranchesPanel'
import { CellReferenceHighlightProvider } from '../../src/components/CellReferenceHighlight'
import { usePlayBranches } from '../../src/components/play/usePlayBranches'
import { branchOriginMasks, branchRules } from '../../src/sudoku/branches'
import { valuesOf, type Game } from '../../src/sudoku/game'
import { starter } from '../support/fixtures'
import { Width } from '../support/frames'

function BranchWorkspaceExample({ width = 425 }: { width?: number }) {
  const [game, setGame] = useState<Game>(() => {
    const cell = 10
    const digit = 7
    const position = { values: valuesOf(starter) }
    const origin = { ...position, candidateMasks: branchOriginMasks(position, branchRules()) }
    return { ...starter, branchWorkspace: { nextNumber: 3, branches: [
      { id: 'first', number: 1, origin, assumption: { cell, digit, truth: true }, edits: [], cursor: 0 },
      { id: 'second', number: 2, origin, assumption: { cell, digit, truth: false }, edits: [{ cell, digit: 4, truth: true }], cursor: 1 },
    ] } }
  })
  const values = valuesOf(game)
  const model = usePlayBranches({ game, values, visible: true, enabled: true, originConflict: false,
    selection: null, updateGame: change => setGame(change), onEnter: () => {} })
  return <Width width={width}>
    <CellReferenceHighlightProvider>
      <div className="puzzle-stage">
        <Board content={{ givens: game.givens, ...(model.board?.content ?? { values }) }}
          appearance={{ candidateLayout: 'center-corner', annotations: model.board?.annotations, label: model.board?.label }}
          interaction={{ selected: model.pending?.cell == null ? [] : [model.pending.cell], active: model.pending?.cell ?? 0,
            onCell: model.pending ? cell => model.selectCell(cell) : undefined }} />
      </div>
      <BranchesPanel model={model} disabled={false} />
    </CellReferenceHighlightProvider>
  </Width>
}

const meta = { title: 'Medium/Tools/Branches', component: BranchWorkspaceExample } satisfies Meta<typeof BranchWorkspaceExample>
export default meta
type Story = StoryObj<typeof meta>

export const CompareOrEdit: Story = {}
export const NarrowWorkspace: Story = { args: { width: 320 } }
