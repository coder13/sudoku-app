import { useState, type ComponentProps } from 'react'
import { fn } from 'storybook/test'
import { Settings } from '../../src/components/Settings'
import { DEFAULT_CELL_REFERENCE_STYLE, type CellReferenceStyle } from '../../src/sudoku/hints'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE,
  DEFAULT_WORKSPACE_MODE,
} from '../../src/sudoku/preferences'
import { DialogStory } from './frames'

type SettingsProps = ComponentProps<typeof Settings>

export const settingArgs = {
  close: fn(),
  section: null,
  advancedModes: DEFAULT_ADVANCED_MODES,
  setAdvancedModes: fn(),
  appearance: DEFAULT_APPEARANCE,
  setAppearance: fn(),
  highlighting: DEFAULT_HIGHLIGHT_PREFERENCES,
  setHighlighting: fn(),
  errorMode: DEFAULT_ERROR_MODE,
  setErrorMode: fn(),
  cellReferenceStyle: DEFAULT_CELL_REFERENCE_STYLE as CellReferenceStyle,
  setCellReferenceStyle: fn(),
  inputSize: DEFAULT_INPUT_SIZE,
  setInputSize: fn(),
  workspaceMode: DEFAULT_WORKSPACE_MODE,
  setWorkspaceMode: fn(),
  onResetLayout: fn(),
  draft: false,
} satisfies SettingsProps

export function SettingsExample(args: SettingsProps) {
  const [advancedModes, setAdvancedModes] = useState(args.advancedModes)
  const [appearance, setAppearance] = useState(args.appearance)
  const [highlighting, setHighlighting] = useState(args.highlighting)
  const [errorMode, setErrorMode] = useState(args.errorMode)
  const [cellReferenceStyle, setCellReferenceStyle] = useState(args.cellReferenceStyle)
  const [inputSize, setInputSize] = useState(args.inputSize)
  const [workspaceMode, setWorkspaceMode] = useState(args.workspaceMode)
  const onWorkspaceModeChange = args.setWorkspaceMode
  return <DialogStory label="Settings">{(close) =>
    <Settings {...args} close={() => { args.close(); close() }}
      advancedModes={advancedModes} setAdvancedModes={(value) => { args.setAdvancedModes(value); setAdvancedModes(value) }}
      appearance={appearance} setAppearance={(value) => { args.setAppearance(value); setAppearance(value) }}
      highlighting={highlighting} setHighlighting={(value) => { args.setHighlighting(value); setHighlighting(value) }}
      errorMode={errorMode} setErrorMode={(value) => { args.setErrorMode(value); setErrorMode(value) }}
      cellReferenceStyle={cellReferenceStyle}
      setCellReferenceStyle={(value) => { args.setCellReferenceStyle(value); setCellReferenceStyle(value) }}
      inputSize={inputSize} setInputSize={(value) => { args.setInputSize(value); setInputSize(value) }}
      workspaceMode={workspaceMode}
      setWorkspaceMode={onWorkspaceModeChange && ((value) => { onWorkspaceModeChange(value); setWorkspaceMode(value) })} />
  }</DialogStory>
}
