import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bookmark, Play } from 'lucide-react'
import { Button } from '../../src/components/Button'
import { PuzzleImportPreview } from '../../src/components/PuzzleImportPreview'

const meta = {
  title: 'Puzzles/Puzzle import preview',
  component: PuzzleImportPreview,
  parameters: {
    docs: { description: { component: 'Share status, progress, error, and action framing while each puzzle family supplies its own preview and import actions.' } },
  },
} satisfies Meta<typeof PuzzleImportPreview>
export default meta

type Story = StoryObj<typeof meta>

const previewBoard = <div aria-label="Puzzle preview" style={{ aspectRatio: '1', maxWidth: 360, border: '1px solid #999', display: 'grid', placeItems: 'center' }}>Puzzle preview</div>

export const VerifiedSudoku: Story = {
  args: {
    summary: <><strong>Classic Sudoku</strong><span className="import-preview-rating" role="status">Unique</span><span className="import-preview-format">Text grid</span></>,
    hasProgress: true,
    children: <>{previewBoard}<p>Classic Sudoku rules apply.</p></>,
    actions: <><Button>Save and import another</Button><Button variant="primary"><Play size={17} /> Open puzzle</Button></>,
  },
}

export const NumberPuzzleWithError: Story = {
  args: {
    summary: <><strong>Futoshiki · 5 × 5</strong><span className="import-preview-rating" role="status">Valid</span><span className="import-preview-format">Shared puzzle link</span></>,
    error: 'This puzzle already exists in your library.',
    children: previewBoard,
    actions: <><Button>Edit input</Button><Button variant="primary"><Bookmark size={17} /> Open puzzle</Button></>,
  },
}
