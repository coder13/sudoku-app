import type { Meta, StoryObj } from '@storybook/react-vite'
import { PlayStageLayers } from '../../src/components/PlayStageLayers'
import { Width } from '../support/frames'

const live = <div className="board-frame"><div className="surface" style={{ padding: 32, textAlign: 'center' }}>Live puzzle</div></div>
const pause = <div className="board-frame puzzle-paused-frame"><div className="puzzle-paused" role="status" aria-label="Puzzle paused"><h2>Puzzle paused</h2><button type="button">Resume puzzle</button></div></div>

const meta = {
  title: 'Small/Play/PlayStageLayers',
  component: PlayStageLayers,
  args: { paused: false, live, pause },
  argTypes: { live: { control: false }, pause: { control: false } },
  decorators: [(Story) => <Width><Story /></Width>],
  parameters: {
    docs: { description: { component: 'Keep live and paused puzzle content mounted in stable layers. The active layer stays interactive; the inactive layer is hidden from assistive technology and removed from interaction.' } },
  },
} satisfies Meta<typeof PlayStageLayers>

export default meta
type Story = StoryObj<typeof meta>

export const Playing: Story = {}
export const Paused: Story = { args: { paused: true } }
