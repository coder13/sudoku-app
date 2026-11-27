import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProofTrace } from '../../src/components/ProofTrace'

const meta = { title: 'Medium/Tools/Proof trace', component: ProofTrace } satisfies Meta<typeof ProofTrace>
export default meta
type Story = StoryObj<typeof meta>

export const NestedCases: Story = { args: { trace: [{
  assumption: 'If R4C2 is 7',
  steps: ['Remove 7 from R4C5 because the cells share row 4.'],
  conclusion: 'Both inner cases contradict the starting assumption.',
  cases: [
    { assumption: 'If R4C5 is 2', steps: ['Remove 2 from R4C8 because the cells share row 4.'], conclusion: 'R4C8 has no candidates.' },
    { assumption: 'If R4C5 is 3', steps: ['Remove 3 from R6C5 because the cells share column 5.'], conclusion: 'R6C5 has no candidates.' },
  ],
}] } }
