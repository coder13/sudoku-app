import { Bookmark, Info, Link2, ListFilter, ListOrdered, Palette, type LucideIcon } from 'lucide-react'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'
import { TOOL_PANEL_ORDER, type PuzzleTool, type ToolPanelTab, type ToolPanels } from '../sudoku/play-session'

export type PlayToolDefinition = {
  id: PuzzleTool
  label: string
  Icon: LucideIcon
  supported: (context: PlayToolContext) => boolean
  availableAfterSolve: boolean
}

export type PlayToolContext = {
  placeholder: boolean
  draft: boolean
  gridPuzzle: boolean
  mixedVariant: boolean
  solved: boolean
}

export type PlayPanelState = Pick<ToolPanels, 'open' | 'active'>

function always(_context: PlayToolContext) { return true }

/** Stable labels and icons shared by Play's tabs and menus. Hosts own panel placement and focus. */
export const PLAY_TOOL_REGISTRY = {
  solution: { id: 'solution', label: 'Solution', Icon: ListOrdered, supported: always, availableAfterSolve: true },
  techniques: { id: 'techniques', label: TECHNIQUE_FINDER_TITLE, Icon: ListFilter, supported: always, availableAfterSolve: true },
  colors: { id: 'colors', label: 'Colors', Icon: Palette, supported: always, availableAfterSolve: false },
  chains: { id: 'chains', label: 'Chains', Icon: Link2, supported: context => !context.gridPuzzle, availableAfterSolve: false },
  bookmarks: { id: 'bookmarks', label: 'Bookmarks', Icon: Bookmark, supported: always, availableAfterSolve: true },
  rules: { id: 'rules', label: 'Rules', Icon: Info, supported: context => context.mixedVariant, availableAfterSolve: true },
} satisfies Record<PuzzleTool, PlayToolDefinition>

export function playToolSupported(tool: PuzzleTool, context: PlayToolContext) {
  return !context.placeholder && !context.draft && PLAY_TOOL_REGISTRY[tool].supported(context)
}

export function playToolAvailable(tool: PuzzleTool, context: PlayToolContext) {
  return playToolSupported(tool, context) && (!context.solved || PLAY_TOOL_REGISTRY[tool].availableAfterSolve)
}

/** Resolve persisted panel state against the current puzzle and host lifecycle. */
export function resolvePlayPanels(state: PlayPanelState, context: PlayToolContext, retainAfterSolve: boolean) {
  const isOpenable = retainAfterSolve ? playToolSupported : playToolAvailable
  const open = state.open.filter(tool => isOpenable(tool, context))
  const active: ToolPanelTab = state.active !== 'digits' && open.includes(state.active) ? state.active : 'digits'
  return { open, active }
}

export const PLAY_TOOL_TABS = TOOL_PANEL_ORDER.map(id => PLAY_TOOL_REGISTRY[id])
export const PLAY_PANEL_ORDER: readonly ToolPanelTab[] = ['digits', ...TOOL_PANEL_ORDER]

export const PLAY_PANEL_LABELS: Record<ToolPanelTab, string> = {
  digits: 'Digits',
  solution: PLAY_TOOL_REGISTRY.solution.label,
  techniques: PLAY_TOOL_REGISTRY.techniques.label,
  colors: PLAY_TOOL_REGISTRY.colors.label,
  chains: PLAY_TOOL_REGISTRY.chains.label,
  bookmarks: PLAY_TOOL_REGISTRY.bookmarks.label,
  rules: PLAY_TOOL_REGISTRY.rules.label,
}

