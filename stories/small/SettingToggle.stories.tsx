import { useState } from 'react'
import { Eye } from 'lucide-react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingToggle } from '../../src/components/SettingToggle'
import { Width } from '../support/frames'

const meta = {
  title: 'Small/Settings/SettingToggle',
  component: SettingToggle,
  args: {
    label: 'Highlight ALS',
    description: 'Show almost-locked sets connected by restricted common candidates.',
    checked: false,
    onChange: () => {},
  },
  decorators: [(Story) => <Width><Story /></Width>],
  render: (args) => {
    const [checked, setChecked] = useState(args.checked)
    return <SettingToggle {...args} checked={checked} onChange={value => { args.onChange(value); setChecked(value) }} />
  },
} satisfies Meta<typeof SettingToggle>
export default meta
type Story = StoryObj<typeof meta>

export const WithDescription: Story = {}
export const Disabled: Story = { args: { label: 'Show timer', description: undefined, disabled: true } }
export const WithLeadingIcon: Story = {
  args: {
    label: 'Show row and column numbers', description: 'Display the 1–9 row and column labels around the Sudoku grid.',
    className: 'appearance-toggle', leading: <span className="settings-menu-icon" aria-hidden="true"><Eye size={20} /></span>,
  },
}
