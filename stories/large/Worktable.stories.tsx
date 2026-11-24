import { useRef, useState, useSyncExternalStore, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, waitFor, within } from 'storybook/test'
import mixedPuzzles from '../../tests/fixtures/mixed-puzzles.json'
import palindrome14 from '../../tests/fixtures/inequality-palindrome14.json'
import renbanArchive from '../../tests/fixtures/renban-coach.json'
import type { VariantPuzzle } from '../../src/sudoku/engine'
import { Worktable, type WorktableActions } from '../../src/components/Worktable'
import { DesktopPlayLayout, PlayWorkspace } from '../../src/components/DesktopPlayLayout'
import { useMobileLayout } from '../../src/components/mobile-layout'
import { newChainSketch } from '../../src/sudoku/chain-sketch'
import { candidateId, type ChainEdge } from '../../src/sudoku/chains'
import { EMPTY, enter, fillEntries, makeGame, paintCells, puzzleIdentity, replaceCandidates, valuesOf, type Game } from '../../src/sudoku/game'
import { recordAction } from '../../src/sudoku/action-history'
import { playPreferenceStore } from '../../src/sudoku/play-preferences'
import { defaultToolPanels, TOOL_PANEL_ORDER, playSession, puzzleTabsKey } from '../../src/sudoku/play-session'
import { DEFAULT_CELL_REFERENCE_STYLE } from '../../src/sudoku/hints'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_HIGHLIGHT_PREFERENCES, DEFAULT_INPUT_SIZE,
  DEFAULT_WORKSPACE_MODE, MAX_GRID_TEXT_SCALE,
} from '../../src/sudoku/preferences'
import { medusaRemovalGame } from '../support/chain-fixtures'
import { inProgress, namedDraft, solved, starter } from '../support/fixtures'
import { roomStore, seedRoom } from '../support/story-room'

const meta = {
  title: 'Large/Play/Worktable',
  component: Worktable,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    game: starter, games: [starter], preferredDifficulty: 'easy', modalOpen: false, advancedModes: DEFAULT_ADVANCED_MODES,
    appearance: DEFAULT_APPEARANCE, highlighting: DEFAULT_HIGHLIGHT_PREFERENCES, errorMode: DEFAULT_ERROR_MODE,
    workspaceMode: DEFAULT_WORKSPACE_MODE,
    cellReferenceStyle: DEFAULT_CELL_REFERENCE_STYLE,
    multi: false, actionsRef: { current: null }, inputSize: DEFAULT_INPUT_SIZE, panelHeight: 280, setPanelHeight: fn(),
    beginResize: fn(), toggleMulti: fn(), onShare: fn(), onPublish: fn(), onCancelDraft: fn(), onStopPlaying: fn(),
    onNewPuzzle: fn(), onImportPuzzle: fn(),
    showLeftPanel: true, showRightPanel: true, showBottomPanel: true, onOpenHintPanel: fn(), onOpenRightPanel: fn(),
    puzzleBrowserView: 'active', setPuzzleBrowserView: fn(),
  },
  beforeEach: ({ args }) => {
    playSession.set(args.game.id, 'toolPanels', defaultToolPanels)
    playSession.activate(null)
    localStorage.removeItem(puzzleTabsKey(args.game.id))
    seedRoom([args.game, ...args.games.filter(({ id }) => id !== args.game.id)])
  },
  render: (args) => <WorktableExample {...args} />,
} satisfies Meta<typeof Worktable>
export default meta
type Story = StoryObj<typeof meta>

const mixedFixture = mixedPuzzles['x-killer']
const mixedRulesGame = {
  ...makeGame('story-mixed-rules', 'X Sudoku + Killer', mixedFixture.puzzle.givens, 'imported'),
  variant: { id: 'mixed' as const, puzzle: mixedFixture.puzzle as VariantPuzzle, solution: mixedFixture.solution },
}

export const Starter: Story = {}
const importedDrawingGame: Game = {
  ...inProgress, id: 'story-imported-drawings', source: 'imported',
  position: { ...inProgress.position, importedDrawings: [
    { shape: 'line', from: [.5, .5], to: [2.5, 2.5], color: 'blueHeavy' },
    { shape: 'cross', at: [2, 1.5], color: 'redHeavy' },
  ] },
}

export const ClearImportedDrawings: Story = {
  args: { game: importedDrawingGame, games: [importedDrawingGame] },
  play: async ({ canvas, userEvent }) => {
    const label = 'Imported Quick Draw annotations'
    await expect(await canvas.findByRole('img', { name: label })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Open puzzle options' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Clear imported drawings' }))
    await waitFor(() => expect(canvas.queryByRole('img', { name: label })).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole('button', { name: /^Undo$/ }))
    await expect(await canvas.findByRole('img', { name: label })).toBeVisible()
  },
}


const splitScreenGame = { ...starter, id: 'split-screen-play' }
export const SplitScreen: Story = {
  args: { game: splitScreenGame, games: [splitScreenGame] },
  parameters: { viewport: { options: {
    splitScreen: { name: 'Android split-screen proportions', styles: { width: '430px', height: '595px' } },
    veryShortSplitScreen: { name: 'Very short split screen', styles: { width: '430px', height: '454px' } },
  } } },
  globals: { viewport: { value: 'splitScreen', isRotated: false } },
  beforeEach: () => {
    const { pinnedActions } = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('pinnedActions', ['singles', 'chain', 'strong-links', 'colors'])
    playSession.set(splitScreenGame.id, 'toolPanels', { open: ['techniques', 'chains'], active: 'digits', height: 340 })
    return () => {
      playPreferenceStore.set('pinnedActions', pinnedActions)
      playSession.activate(null)
      localStorage.removeItem(puzzleTabsKey(splitScreenGame.id))
    }
  },
  render: (args) => <WorktableExample {...args} withTopbar />,
}
export const VeryShortSplitScreen: Story = {
  ...SplitScreen,
  globals: { viewport: { value: 'veryShortSplitScreen', isRotated: false } },
}
export const CycleHighlightedDigit: Story = {
  args: {
    game: fillEntries(starter, [...solved.position.entries].map(digit => '139'.includes(digit) ? digit : '0').join('')),
    games: [],
  },
  play: async ({ canvas, userEvent }) => {
    for (const digit of [2, 4, 5, 6, 7, 8, 2]) {
      await userEvent.keyboard('`')
      const keypad = within(canvas.getByRole('group', { name: 'Digit pad' }))
      await expect(keypad.getByRole('button', { name: `Deselect ${digit}` })).toHaveAttribute('aria-pressed', 'true')
    }
  },
}
export const MixedRules: Story = {
  args: { game: mixedRulesGame, games: [mixedRulesGame] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Puzzle rules' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Puzzle rules' })
    const rules = within(dialog)
    await waitFor(() => expect(rules.getByRole('heading', { name: 'Normal Sudoku' })).toBeVisible())
    await userEvent.hover(rules.getByRole('heading', { name: 'Killer Sudoku' }))
    await waitFor(() => expect(dialog.querySelector('.variant-rules-preview [data-highlighted-rule="killer-cages"]')).toBeInTheDocument())
    await userEvent.click(rules.getByRole('button', { name: 'Pin rules' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    const rulesTab = canvas.getByRole('tab', { name: 'Rules' })
    await expect(rulesTab).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(rulesTab).toHaveFocus())
    const panel = canvas.getByRole('region', { name: 'Puzzle rules' })
    within(panel).getByRole('region', { name: 'Diagonal' }).focus()
    await waitFor(() => expect(canvasElement.querySelector('.puzzle-stage [data-highlighted-rule="diagonal"]')).toBeInTheDocument())
  },
}
export const MixedRulesMobile: Story = {
  ...MixedRules,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
export const DesktopModeBadge: Story = {
  args: { game: inProgress, games: [inProgress] },
  beforeEach: () => {
    const saved = playPreferenceStore.getSnapshot().cardModeBadgePosition
    playPreferenceStore.set('cardModeBadgePosition', { edge: 'left', offset: 0.5 })
    return () => playPreferenceStore.set('cardModeBadgePosition', saved)
  },
  render: (args) => <WorktableExample {...args} withTopbar resizable />,
}
export const MobileInputTools: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (!canvasElement.querySelector('.mobile-panel-layout')) return
    const trigger = canvas.getByRole('button', { name: 'Input tools' })
    await userEvent.click(trigger)
    const inputTools = await canvas.findByRole('group', { name: 'Input tools' })
    const menuPosition = inputTools.getBoundingClientRect()
    const anchorGap = trigger.getBoundingClientRect().bottom - menuPosition.bottom
    expect(Math.abs(anchorGap)).toBeLessThan(1)
    const menu = within(inputTools)
    expect(menu.queryByRole('button', { name: 'Generate candidates' })).not.toBeInTheDocument()
    expect(menu.getAllByRole('button', { pressed: false }).map(button => button.textContent?.trim()))
      .toEqual(['Solution', 'Techniques', 'Colors', 'Chains'])
    for (const name of ['Solution', 'Techniques']) {
      const toggle = menu.getByRole('button', { name })
      toggle.focus()
      await userEvent.keyboard('{Enter}')
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(toggle).toHaveFocus()
      await expect(canvas.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
      const inputCard = canvasElement.querySelector('[data-mobile-panel="input"] > .mobile-panel-content')
      await Promise.allSettled(inputCard?.getAnimations().map(animation => animation.finished) ?? [])
      const currentPosition = inputTools.getBoundingClientRect()
      expect(currentPosition.top).toBeCloseTo(menuPosition.top, 1)
      expect(currentPosition.left).toBeCloseTo(menuPosition.left, 1)
      await userEvent.click(toggle)
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    }
    await userEvent.click(menu.getByRole('button', { name: 'Chains' }))
    await userEvent.click(menu.getByRole('button', { name: 'Colors' }))
    await userEvent.keyboard('{Escape}')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toHaveFocus()
    const tabs = canvas.getByRole('tablist', { name: 'Sudoku input' })
    await expect(within(tabs).getByRole('tab', { name: 'Colors' })).toHaveAttribute('aria-selected', 'true')
    await expect(within(tabs).getByRole('tab', { name: 'Chains' })).toBeInTheDocument()
    const colors = within(tabs).getByRole('tab', { name: 'Colors' })
    const digits = within(tabs).getByRole('tab', { name: 'Digits' })
    const cell = () => canvas.getByRole('gridcell', { name: /^Row 1, column 3,/ })
    await userEvent.click(canvas.getByRole('button', { name: 'Light mint' }))
    await userEvent.click(cell())
    await expect(cell()).toHaveClass('color-4')
    await userEvent.click(digits)
    await expect(cell()).toHaveClass('color-4')
    await userEvent.click(colors)
    await userEvent.click(canvas.getByRole('button', { name: 'Close colors panel' }))
    await expect(digits).toHaveAttribute('aria-selected', 'true')
    await expect(cell()).not.toHaveClass('color-4')
    await userEvent.keyboard('{Enter}')
    await expect(tabs).not.toBeInTheDocument()
  },
}
export const PuzzlePanelToggles: Story = {
  args: { game: inProgress, games: [inProgress] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (!canvasElement.querySelector('.mobile-panel-layout')) return
    const options = canvas.getByRole('button', { name: 'Open puzzle options' })
    await userEvent.click(options)
    const toolButtons = within(canvasElement.querySelector<HTMLElement>('#puzzle-menu')!).getAllByRole('button', {
      name: /^(Colors|Chains)$/,
    })
    expect(toolButtons.map(button => button.textContent?.trim())).toEqual(['Colors', 'Chains'])
    const chains = canvas.getByRole('button', { name: 'Chains', pressed: false })
    await userEvent.click(chains)
    const colors = canvas.getByRole('button', { name: 'Colors', pressed: false })
    colors.focus()
    await userEvent.keyboard('{Enter}')
    await expect(colors).toHaveAttribute('aria-pressed', 'true')
    await expect(colors).toHaveFocus()
    await expect(canvas.getByRole('tab', { name: 'Colors' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('tab', { name: 'Chains' }))
    const tabs = within(canvas.getByRole('tablist', { name: 'Sudoku input' })).getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Digits', 'Colors', 'Chains'])
    await userEvent.click(canvas.getByRole('button', { name: 'Colors', pressed: true }))
    await expect(canvas.queryByRole('tab', { name: 'Colors' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('tab', { name: 'Chains' })).toHaveAttribute('aria-selected', 'true')
    await expect(options).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    await expect(options).toHaveAttribute('aria-expanded', 'false')
    await expect(options).toHaveFocus()
  },
}
export const DesktopInsightToggles: Story = {
  args: { game: inProgress, games: [inProgress] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (canvasElement.querySelector('.mobile-panel-layout')) return
    const options = canvas.getByRole('button', { name: 'Open puzzle options' })
    await userEvent.click(options)
    const menu = within(canvasElement.querySelector<HTMLElement>('#puzzle-menu')!)
    const solution = menu.getByRole('button', { name: 'Solution' })
    const techniques = menu.getByRole('button', { name: 'Techniques' })
    solution.focus()
    await userEvent.keyboard('{Enter}')
    await expect(solution).toHaveAttribute('aria-pressed', 'true')
    await expect(solution).toHaveFocus()
    await expect(canvas.getByRole('button', { name: 'Reveal solution' })).toBeInTheDocument()
    await userEvent.click(techniques)
    await expect(techniques).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('tab', { name: 'Techniques' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(solution)
    await expect(canvas.queryByRole('tab', { name: 'Solution' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('tab', { name: 'Techniques' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(techniques)
    await expect(canvas.queryByRole('tablist', { name: 'Puzzle insight tabs' })).not.toBeInTheDocument()
    await expect(options).toHaveAttribute('aria-expanded', 'true')
  },
}
export const MobileInsightTabs: Story = {
  args: { game: inProgress, games: [inProgress] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (!canvasElement.querySelector('.mobile-panel-layout')) return
    await userEvent.click(canvas.getByRole('button', { name: 'Open puzzle options' }))
    const menu = within(canvasElement.querySelector<HTMLElement>('#puzzle-menu')!)
    await userEvent.click(menu.getByRole('button', { name: 'Solution' }))
    await expect(canvas.getByRole('tab', { name: 'Solution' })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('button', { name: 'Reveal solution' })).toBeInTheDocument()
    await userEvent.click(menu.getByRole('button', { name: 'Techniques' }))
    await expect(canvas.getByRole('tab', { name: 'Techniques' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    const input = canvasElement.querySelector<HTMLElement>('.mobile-input-tabs')!
    await expect(canvasElement.querySelector('.mobile-panel-layout')).not.toHaveAttribute('data-input-sized')
    const tabbedHeight = input.offsetHeight
    await userEvent.click(canvas.getByRole('tab', { name: 'Digits' }))
    expect(input.offsetHeight).toBe(tabbedHeight)
    const divider = canvas.getByRole('separator', { name: 'Resize puzzle and input panels' })
    divider.focus()
    await userEvent.keyboard('{ArrowUp}')
    const resized = input.offsetHeight
    expect(resized).toBeGreaterThan(tabbedHeight)
    await userEvent.click(canvas.getByRole('tab', { name: 'Solution' }))
    expect(input.offsetHeight).toBe(resized)
    await userEvent.click(canvas.getByRole('button', { name: 'Reveal solution' }))
    await expect(await canvas.findByRole('list', { name: 'Solving steps' })).toBeVisible()
    await expect(canvas.getByRole('grid', { name: 'Solution preview' })).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: 'Digits' }))
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: 'Solution' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Close solution panel' }))
    await expect(canvas.queryByRole('tab', { name: 'Solution' })).not.toBeInTheDocument()
    expect(input.offsetHeight).toBe(resized)
    await userEvent.click(canvas.getByRole('button', { name: 'Close techniques panel' }))
    await expect(canvas.queryByRole('tab', { name: 'Techniques' })).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('.mobile-panel-layout')).not.toHaveAttribute('data-input-sized')
  },
}

export const RestoredMobileSolution: Story = {
  args: { game: { ...starter, id: 'restored-mobile-solution' } },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: ({ args }) => {
    playSession.set(args.game.id, 'toolPanels', { open: ['solution', 'techniques'], active: 'solution', height: 308 })
    playSession.set(args.game.id, 'solutionView', { identity: puzzleIdentity(args.game), step: 3, hintOpen: true })
  },
}
const palindromeSolutionGame: Game = {
  ...makeGame('story-palindrome-14', 'Palindrome 14', palindrome14.puzzle.givens, 'imported'),
  variant: { id: 'mixed', puzzle: palindrome14.puzzle as VariantPuzzle, solution: palindrome14.solution },
  score: null, difficulty: null, variantRatingVersion: 21,
}

const stalledSource = renbanArchive.examples[2] as { puzzle: VariantPuzzle; solution: string; title: string }
const stalledSolutionGame: Game = {
  ...makeGame('story-renbann9', stalledSource.title, stalledSource.puzzle.givens, 'imported'),
  variant: { id: 'renban', puzzle: stalledSource.puzzle, solution: stalledSource.solution },
  score: null, difficulty: null, variantRatingVersion: 11,
}

export const StalledVariantSolution: Story = {
  args: { game: stalledSolutionGame, games: [stalledSolutionGame] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  beforeEach: ({ args }) => {
    playSession.set(args.game.id, 'toolPanels', { open: ['solution'], active: 'solution', height: 308 })
    playSession.set(args.game.id, 'solutionView', { identity: puzzleIdentity(args.game), step: 0, hintOpen: false })
  },
  play: async ({ canvas, userEvent }) => {
    const rows = within(await canvas.findByRole('list', { name: 'Solving steps' }))
    const partial = rows.getByRole('button', { name: /^Last position/ })
    const exact = rows.getByRole('button', { name: /^Exact solution/ })
    const digits = () => [...canvas.getByRole('grid', { name: 'Solution preview' }).querySelectorAll('.cell-value')]
      .map(cell => cell.textContent).join('')
    await userEvent.click(partial)
    expect(digits().length).toBeLessThan(81)
    await userEvent.keyboard('{End}')
    await expect(exact).toHaveAttribute('aria-current', 'step')
    expect(digits()).toBe(stalledSource.solution)
    await userEvent.keyboard('{ArrowUp}')
    await expect(partial).toHaveAttribute('aria-current', 'step')
    expect(digits().length).toBeLessThan(81)
    expect(roomStore.getSnapshot().games.find(game => game.id === stalledSolutionGame.id)?.position.entries).toBe(EMPTY)
  },
}

export const CompleteVariantSolution: Story = {
  ...StalledVariantSolution,
  args: { game: palindromeSolutionGame, games: [palindromeSolutionGame] },
  play: async ({ canvas, userEvent }) => {
    const rows = within(await canvas.findByRole('list', { name: 'Solving steps' }))
    await userEvent.click(rows.getAllByRole('button', { name: /^Matching digit layouts/ })[2])
    await userEvent.click(await canvas.findByText('Read the proof step by step', { exact: true }))
    expect(await canvas.findByText('This layout leads to a contradiction.', { exact: true })).toBeVisible()
    const final = rows.getByRole('button', { name: /^Final grid/ })
    await userEvent.click(final)
    await expect(final).toHaveAttribute('aria-current', 'step')
    const digits = [...canvas.getByRole('grid', { name: 'Solution preview' }).querySelectorAll('.cell-value')]
      .map(cell => cell.textContent).join('')
    expect(digits).toBe(palindrome14.solution)
    expect(roomStore.getSnapshot().games.find(game => game.id === palindromeSolutionGame.id)?.position.entries).toBe(EMPTY)
  },
}

const branchRoot = candidateId({ cell: 50, digit: 4 })
const branchTip = candidateId({ cell: 50, digit: 1 })
const branchedLinks: ChainEdge[] = [
  [candidateId({ cell: 23, digit: 2 }), candidateId({ cell: 23, digit: 4 })],
  [candidateId({ cell: 23, digit: 4 }), branchRoot],
  [branchRoot, candidateId({ cell: 32, digit: 4 })],
  [branchRoot, branchTip],
]
const branchedGame = {
  ...starter,
  chainSketch: { sketches: [{ ...newChainSketch(1), history: [[], branchedLinks] }], activeId: 1, pending: null },
}
export const ChainShortcuts: Story = {
  args: { game: branchedGame, games: [branchedGame] },
  play: async ({ canvas, userEvent }) => {
    const grid = () => canvas.findByRole('grid', { name: 'Sudoku grid' })
    await userEvent.keyboard('dh')
    await expect(await grid()).toHaveAccessibleDescription('Highlight mode')
    await userEvent.keyboard('x')
    const linkGrid = within(await canvas.findByRole('grid', { name: 'Sudoku grid for drawing links' }))
    const candidate = linkGrid.getByRole('button', { name: /^4 in row 6, column 6/ })
    await userEvent.click(candidate)
    await expect(candidate).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('b')
    await expect(candidate).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Escape}')
    await expect(await grid()).toHaveAccessibleDescription('Highlight mode')
    await userEvent.keyboard('x')
    await canvas.findByRole('grid', { name: 'Sudoku grid for drawing links' })
    await userEvent.keyboard('x')
    await expect(await grid()).toHaveAccessibleDescription('Highlight mode')
  },
}
export const InputModeAfterChains: Story = {
  args: { game: branchedGame, games: [branchedGame] },
  beforeEach: () => {
    const saved = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('pinnedActions', ['strong-links'])
    return () => {
      playPreferenceStore.set('pinnedActions', saved.pinnedActions)
      playPreferenceStore.set('pencil', saved.pencil)
      playPreferenceStore.set('highlightMode', saved.highlightMode)
      playPreferenceStore.set('colorMode', saved.colorMode)
      playPreferenceStore.set('eraseMode', saved.eraseMode)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const grid = () => canvas.findByRole('grid', { name: /^Sudoku grid$/ })
    const strongLinks = canvas.getByRole('button', { name: 'Strong links' })
    const highlight = canvas.getByRole('button', { name: 'Highlight mode' })
    const pencil = canvas.getByRole('button', { name: 'Pencil mode' })
    async function showStrongLinks() {
      await userEvent.click(strongLinks)
      await canvas.findByRole('grid', { name: 'Sudoku grid with strong links' })
    }

    await userEvent.keyboard('d')
    await showStrongLinks()
    await userEvent.click(highlight)
    await expect(await grid()).toHaveAccessibleDescription('Highlight mode')
    await userEvent.click(highlight)
    await expect(await grid()).toHaveAccessibleDescription('Pen mode')
    await expect(strongLinks).toHaveAttribute('aria-pressed', 'false')

    await showStrongLinks()
    await userEvent.click(pencil)
    await expect(await grid()).toHaveAccessibleDescription('Pencil mode')
    await userEvent.keyboard('x')
    await canvas.findByRole('grid', { name: 'Sudoku grid for drawing links' })
    await userEvent.keyboard('hh')
    await expect(await grid()).toHaveAccessibleDescription('Pencil mode')

    await showStrongLinks()
    await userEvent.keyboard('d')
    await expect(await grid()).toHaveAccessibleDescription('Pen mode')
    await showStrongLinks()
    await userEvent.keyboard('q')
    await expect(await grid()).toHaveAccessibleDescription('Pencil mode')
  },
}
const strongLinksGame = { ...starter, id: 'strong-links-selected-digit' }
export const StrongLinksSelectedDigit: Story = {
  args: { game: strongLinksGame, games: [strongLinksGame] },
  beforeEach: () => {
    const saved = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('pinnedActions', ['strong-links'])
    playPreferenceStore.set('selectedDigit', null)
    playSession.set(strongLinksGame.id, 'showStrongLinks', false)
    return () => {
      playPreferenceStore.set('pinnedActions', saved.pinnedActions)
      playPreferenceStore.set('selectedDigit', saved.selectedDigit)
      playPreferenceStore.set('pencil', saved.pencil)
      playPreferenceStore.set('highlightMode', saved.highlightMode)
      playPreferenceStore.set('colorMode', saved.colorMode)
      playPreferenceStore.set('eraseMode', saved.eraseMode)
    }
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const strongLinks = canvas.getByRole('button', { name: /^Strong links$/ })
    await userEvent.keyboard('d4')
    await expect(canvas.getByRole('button', { name: 'Deselect 4' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(strongLinks)
    await canvas.findByRole('grid', { name: 'Sudoku grid with strong links' }, { timeout: 5000 })
    await expect(canvas.getByRole('button', { name: 'Clear highlight for 4' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvasElement.querySelector('.board-link-target')).toBeInTheDocument()
    await userEvent.click(strongLinks)
    await expect(canvas.getByRole('button', { name: 'Deselect 4' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(strongLinks)
    await userEvent.keyboard('{Shift>}6{/Shift}')
    await expect(canvas.getByRole('button', { name: 'Clear highlight for 4' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: 'Clear highlight for 6' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(strongLinks)
    await userEvent.keyboard('d0')
    await userEvent.click(canvas.getByRole('gridcell', { name: /^Row 1, column 1, given 5/ }))
    await userEvent.click(strongLinks)
    await expect(canvas.getByRole('button', { name: 'Clear highlight for 5' })).toHaveAttribute('aria-pressed', 'true')
  },
}
export const ModeCursors: Story = {
  args: { game: { ...inProgress, id: 'mode-cursors' } },
  beforeEach: () => {
    const saved = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('selectedDigit', null)
    playPreferenceStore.set('colorBrush', null)
    return () => {
      playPreferenceStore.set('selectedDigit', saved.selectedDigit)
      playPreferenceStore.set('colorBrush', saved.colorBrush)
      playPreferenceStore.set('pencil', saved.pencil)
      playPreferenceStore.set('highlightMode', saved.highlightMode)
      playPreferenceStore.set('colorMode', saved.colorMode)
      playPreferenceStore.set('eraseMode', saved.eraseMode)
      playPreferenceStore.set('colorTarget', saved.colorTarget)
    }
  },
  play: async ({ canvas, userEvent }) => {
    if (!matchMedia('(any-pointer: fine)').matches) return
    await userEvent.keyboard('d')
    const cell = () => canvas.getByRole('gridcell', { name: /^Row 1, column 4,/ })
    await userEvent.hover(cell())
    const pen = getComputedStyle(cell()).cursor
    expect(pen).toBe('pointer')

    await userEvent.keyboard('{Control>}')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Pencil mode')
    expect(getComputedStyle(cell()).cursor).toBe(pen)
    await userEvent.keyboard('{/Control}')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Pen mode')
    await userEvent.keyboard('q')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Pencil mode')

    await userEvent.keyboard('c')
    const palette = within(await canvas.findByRole('region', { name: 'Coloring' }))
    await userEvent.click(palette.getByRole('button', { name: 'Cells' }))
    await userEvent.click(palette.getByRole('button', { name: 'Light mint' }))
    await userEvent.hover(cell())
    expect(getComputedStyle(cell()).cursor).toBe(pen)

    await userEvent.click(palette.getByRole('button', { name: 'Candidates' }))
    const candidate = await canvas.findByRole('button', { name: /^2 in row 1, column 4\b/ })
    expect(getComputedStyle(candidate).cursor).toBe(pen)
    await userEvent.click(palette.getByRole('button', { name: 'Stop coloring' }))
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Pencil mode')
    await userEvent.click(palette.getByRole('button', { name: 'Light mint' }))
    await userEvent.keyboard('q')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Highlight mode')
    await userEvent.keyboard('q')
    expect(getComputedStyle(cell()).cursor).toBe(pen)
    await userEvent.keyboard('q')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Pencil mode')

    await userEvent.keyboard('x')
    const grid = await canvas.findByRole('grid', { name: 'Sudoku grid for drawing links' }, { timeout: 5000 })
    expect(getComputedStyle(within(grid).getAllByRole('button')[0]).cursor).toBe('crosshair')
    await userEvent.keyboard('q')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toHaveAccessibleDescription('Highlight mode')
    await userEvent.keyboard('q')
    expect(getComputedStyle(cell()).cursor).toBe(pen)
  },
}
const cellPaintingGame = { ...inProgress, id: 'cell-painting' }
export const CellPainting: Story = {
  args: { game: cellPaintingGame, games: [cellPaintingGame] },
  beforeEach: () => {
    const saved = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('selectedDigit', null)
    playPreferenceStore.set('colorBrush', null)
    playPreferenceStore.set('colorTarget', 'cell')
    return () => {
      playPreferenceStore.set('selectedDigit', saved.selectedDigit)
      playPreferenceStore.set('colorBrush', saved.colorBrush)
      playPreferenceStore.set('colorTarget', saved.colorTarget)
      playPreferenceStore.set('pencil', saved.pencil)
      playPreferenceStore.set('highlightMode', saved.highlightMode)
      playPreferenceStore.set('eraseMode', saved.eraseMode)
      playPreferenceStore.set('colorMode', saved.colorMode)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const grid = () => canvas.getByRole('grid', { name: 'Sudoku grid' })
    const cell = () => within(grid()).getByRole('gridcell', { name: /^Row 1, column 4,/ })
    await userEvent.keyboard('dqc')
    const palette = within(await canvas.findByRole('region', { name: 'Coloring' }))
    const rose = palette.getByRole('button', { name: 'Light rose' })
    const swatchTop = rose.getBoundingClientRect().top
    await userEvent.click(rose)
    expect(rose.getBoundingClientRect().top).toBeCloseTo(swatchTop)
    await expect(grid()).toHaveAccessibleDescription('Color mode')
    await expect(palette.queryByText('Choose cells to paint rose.')).not.toBeInTheDocument()
    await userEvent.keyboard('2')
    await expect(cell()).toHaveClass('candidate-highlight-cell')
    await userEvent.click(cell())
    await expect(cell()).toHaveClass('color-1')
    await expect(cell()).toHaveAccessibleName(/candidates 2/)
    await userEvent.click(rose)
    await expect(rose).toHaveAttribute('aria-pressed', 'false')
    await expect(grid()).toHaveAccessibleDescription('Pencil mode')

    for (const [shortcut, mode] of [['h', 'Highlight'], ['de', 'Erase']]) {
      await userEvent.keyboard(shortcut)
      await expect(grid()).toHaveAccessibleDescription(`${mode} mode`)
      await userEvent.click(rose)
      await expect(grid()).toHaveAccessibleDescription('Color mode')
      await userEvent.click(rose)
      await expect(grid()).toHaveAccessibleDescription(`${mode} mode`)
    }
    await userEvent.keyboard('d0{Shift>}24{/Shift}')
    await expect(grid()).toHaveAccessibleDescription('Pen mode')
    await userEvent.click(rose)
    await userEvent.keyboard('3')
    await userEvent.click(rose)
    await expect(grid()).toHaveAccessibleDescription('Pen mode')
    await userEvent.keyboard('dq')
  },
}
export const StrongLinksFromChainsPanel: Story = {
  beforeEach: ({ args }) => {
    playSession.set(args.game.id, 'toolPanels', { open: ['chains'], active: 'digits' })
    const { pinnedActions, selectedDigit } = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('pinnedActions', ['strong-links'])
    playPreferenceStore.set('selectedDigit', null)
    return () => {
      playPreferenceStore.set('pinnedActions', pinnedActions)
      playPreferenceStore.set('selectedDigit', selectedDigit)
    }
  },
  play: async ({ canvas, userEvent }) => {
    const keypad = within(canvas.getByRole('group', { name: 'Digit pad' }))
    const selectEight = keypad.queryByRole('button', { name: /^Select 8$/ })
    if (selectEight) await userEvent.click(selectEight)
    await expect(keypad.getByRole('button', { name: 'Deselect 8' })).toHaveAttribute('aria-pressed', 'true')
    const actions = canvas.queryByRole('region', { name: 'Chains' }) ??
      canvas.getByRole('navigation', { name: 'Pinned puzzle actions' })
    const toggle = await within(actions).findByRole('button', { name: /^(Show )?strong links$/i }, { timeout: 5000 })
    await userEvent.click(toggle)
    const grid = await canvas.findByRole('grid', { name: 'Sudoku grid with strong links' })
    await expect(keypad.getByRole('button', { name: 'Clear highlight for 8' })).toHaveAttribute('aria-pressed', 'true')
    await expect(within(grid).getAllByRole('button', { name: /^8 in row .*strong link color/i })[0]).toBeVisible()

    await userEvent.click(toggle)
    await expect(keypad.getByRole('button', { name: 'Deselect 8' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    await userEvent.keyboard('{Shift>}[Digit7]{/Shift}')
    await expect(keypad.getByRole('button', { name: 'Clear highlight for 7' })).toHaveAttribute('aria-pressed', 'true')
    await expect(keypad.getByRole('button', { name: 'Clear highlight for 8' })).toHaveAttribute('aria-pressed', 'true')
  },
}
export const ChainProofPreview: Story = {
  args: { game: branchedGame, games: [branchedGame] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.keyboard('x')
    const grid = await canvas.findByRole('grid', { name: 'Sudoku grid for drawing links' })
    await userEvent.click(await canvas.findByText('Why this works', { selector: 'summary' }))
    const proof = await canvas.findByText('2r3c6 = 4r3c6 − 4r6c6 = 4r4c6')
    const faded = () => canvasElement.querySelectorAll('.board-links g[opacity="0.5"]')
    const branch = within(grid).getByRole('button', { name: /^1 in row 6, column 6,/ })
    await expect(branch).toHaveStyle({ opacity: '1' })
    await userEvent.hover(proof)
    await waitFor(() => expect(faded()).toHaveLength(1))
    await expect(branch).toHaveStyle({ opacity: '0.5' })
    await userEvent.unhover(proof)
    await waitFor(() => expect(faded()).toHaveLength(0))
  },
}
export const MedusaRemoval: Story = {
  args: { game: medusaRemovalGame, games: [medusaRemovalGame] },
}
export const DisabledChainEdits: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.keyboard('x')
    await expect(await canvas.findByRole('button', { name: 'Apply edits' })).toBeDisabled()
  },
}
export const RemoveBranchTip: Story = {
  args: { game: branchedGame, games: [branchedGame] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open puzzle options' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Chains', pressed: false }))
    await userEvent.keyboard('{Escape}')
    const grid = within(await canvas.findByRole('grid', { name: 'Sudoku grid for drawing links' }))
    const chain = canvas.getByRole('button', { name: /^Chain 1$/ })
    const branchNotation = /, 4r6c6 = 1r6c6/
    const junction = grid.getByRole('button', { name: /^4 in row 6, column 6\b/ })
    await userEvent.click(junction)
    await userEvent.click(junction)
    await expect(junction).toHaveAttribute('aria-pressed', 'false')
    await expect(chain).toHaveTextContent(branchNotation)

    const tip = grid.getByRole('button', { name: /^1 in row 6, column 6\b/ })
    await userEvent.click(tip)
    await expect(tip).toHaveAttribute('aria-pressed', 'true')
    tip.focus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Branch tip removed.')).toBeVisible()
    await expect(chain).not.toHaveTextContent(branchNotation)
    await expect(tip).toBeVisible()
    const undoEdit = canvas.getByRole('button', { name: 'Undo edit' })
    const redoEdit = canvas.getByRole('button', { name: 'Redo edit' })
    await expect(redoEdit).toBeDisabled()
    await userEvent.click(undoEdit)
    await expect(chain).toHaveTextContent(branchNotation)
    await expect(tip).toHaveAttribute('aria-pressed', 'true')
    await expect(redoEdit).toBeEnabled()
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect(chain).toHaveTextContent('No links yet.')
    await userEvent.keyboard('{Control>}y{/Control}')
    await expect(chain).toHaveTextContent(branchNotation)
    await userEvent.keyboard('{Meta>}{Shift>}Z{/Shift}{/Meta}')
    await expect(chain).not.toHaveTextContent(branchNotation)
    await expect(tip).toHaveAttribute('aria-pressed', 'false')
    await expect(redoEdit).toBeDisabled()
    await userEvent.click(undoEdit)
    await userEvent.click(redoEdit)
    await expect(chain).not.toHaveTextContent(branchNotation)
    await userEvent.click(undoEdit)
    await userEvent.click(tip)
    await expect(redoEdit).toBeDisabled()

    await userEvent.click(canvas.getByRole('button', { name: 'Done drawing' }))
    const showLinks = canvas.getByRole('button', { name: 'Show strong links' })
    await userEvent.click(showLinks)
    await expect(showLinks).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.queryByText('Select a candidate or link to start drawing.')).not.toBeInTheDocument()
  },
}
export const TemporaryPencil: Story = {
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3,/ })
    await userEvent.click(canvas.getByRole('button', { name: /^Select 4$/ }))
    await userEvent.keyboard('{Meta>}')
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName(/empty, candidates 4/)
    await userEvent.keyboard('{/Meta}')
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.keyboard('{Control>}')
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    await userEvent.keyboard('{/Control}')
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
  },
}
export const PenDigitToggle: Story = {
  play: async ({ canvas, userEvent }) => {
    const digit = canvas.getByRole('button', { name: /^Select 1$/ })
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 8,/ })
    await userEvent.click(digit)
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName('Row 1, column 8, digit 1')
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName('Row 1, column 8, empty')
    await expect(canvas.getByRole('button', { name: /^Deselect 1$/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(cell).toHaveAccessibleName('Row 1, column 8, digit 1')
    await userEvent.click(cell)
    await expect(cell).toHaveAccessibleName('Row 1, column 8, empty')
  },
}
const rapidTapMasks = Array<number>(81).fill(0)
rapidTapMasks[2] = (1 << 3) | (1 << 4)
rapidTapMasks[40] = 1 << 4

const highlightMasks = [...rapidTapMasks]
highlightMasks[3] = rapidTapMasks[2] | (1 << 5)
const highlightGame = { ...replaceCandidates(starter, highlightMasks, { recordHistory: false }), id: 'story-candidate-highlights' }
export const CandidateHighlightModes: Story = {
  args: { game: highlightGame, games: [highlightGame] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const keypad = within(canvas.getByRole('group', { name: 'Digit pad' }))
    await userEvent.keyboard('{Shift>}')
    await userEvent.click(keypad.getByRole('button', { name: 'Select 4' }))
    await userEvent.click(keypad.getByRole('button', { name: 'Select 5' }))
    await userEvent.keyboard('{/Shift}')

    const exact = canvas.getByRole('gridcell', { name: /^Row 1, column 3,/ })
    const mixed = canvas.getByRole('gridcell', { name: /^Row 1, column 4,/ })
    const subset = canvas.getByRole('gridcell', { name: /^Row 5, column 5,/ })
    await expect(exact).toHaveClass('candidate-highlight-cell')
    await expect(subset).toHaveClass('candidate-highlight-cell')
    await expect(mixed).not.toHaveClass('candidate-highlight-cell')
    await expect(mixed).toHaveAccessibleName(/candidates 4, 5 highlighted/)
    const any = canvas.getByRole('button', { name: /Switch to all/i })
    any.focus()
    await userEvent.keyboard('{Enter}')
    await expect(mixed).toHaveClass('candidate-highlight-cell')
    await expect(subset).not.toHaveClass('candidate-highlight-cell')
    await userEvent.click(canvas.getByRole('button', { name: /Switch to any/i }))
  },
}

export const PencilCandidatePreview: Story = {
  args: { game: replaceCandidates(starter, rapidTapMasks, { recordHistory: false }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select 4' }))
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    const removal = canvas.getByRole('gridcell', { name: 'Row 1, column 3, empty, candidates 4 5' })
    const addition = canvas.getByRole('gridcell', { name: 'Row 1, column 4, empty' })
    for (const [cell, description] of [[removal, 'Remove candidate 4'], [addition, 'Add candidate 4']] as const) {
      const { x, y, width, height } = cell.getBoundingClientRect()
      fireEvent.pointerMove(grid, { pointerType: 'mouse', clientX: x + width / 2, clientY: y + height / 2 })
      await expect(cell).toHaveAccessibleDescription(description)
    }
    for (const key of ['Meta', 'Control']) {
      await userEvent.keyboard(`{${key}>}`)
      await expect(grid).toHaveAccessibleDescription('Pencil mode')
      await expect(addition).toHaveAccessibleDescription('Add candidate 4')
      await userEvent.keyboard(`{/${key}}`)
      await expect(grid).toHaveAccessibleDescription('Pencil mode')
      await expect(addition).toHaveAccessibleDescription('Add candidate 4')
    }
    await expect(removal).toHaveAccessibleName(/^Row 1, column 3, empty, candidates 4 5(?:, cell highlighted for candidate 4)?$/)
    await expect(addition).toHaveAccessibleName('Row 1, column 4, empty')
    fireEvent.pointerMove(grid, { pointerType: 'mouse', clientX: 0, clientY: 0 })
  },
}
export const RapidPencilTaps: Story = {
  args: { game: replaceCandidates(starter, rapidTapMasks, { recordHistory: false }) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select 4' }))
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })
    fireEvent.click(cell, { detail: 1 })
    await expect(cell).toHaveAccessibleName(/empty, candidates 5/)
    fireEvent.click(cell, { detail: 2 })
    fireEvent.doubleClick(cell, { detail: 2 })
    await expect(cell).toHaveAccessibleName(/empty, candidates 4 5/)
    fireEvent.click(cell, { detail: 3 })
    await expect(cell).toHaveAccessibleName(/empty, candidates 5/)
  },
}
export const DoubleClickSingle: Story = {
  args: { game: replaceCandidates(starter, rapidTapMasks, { recordHistory: false }) },
  play: async ({ canvas, userEvent }) => {
    const cell = canvas.getByRole('gridcell', { name: /^Row 5, column 5, empty/ })
    await userEvent.dblClick(cell)
    await expect(cell).toHaveAccessibleName(/digit 5/)
  },
}
export const Generating: Story = {
  args: {
    game: { ...makeGame('generating', 'New puzzle', EMPTY, 'draft', 0), paused: true, difficulty: 'easy', score: 0 },
    games: [],
    placeholder: <div role="status"><h2>Generating a puzzle…</h2></div>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Generating a puzzle…')
    await expect(canvas.getByRole('button', { name: 'Select 1' })).toBeDisabled()
  },
}
export const ClickAwayClearsCell: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })
    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 4' }))
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    const menu = canvas.getByRole('button', { name: 'Open puzzle options' })
    await userEvent.click(menu)
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(canvasElement.querySelector('.puzzle-actions')!)
    await expect(cell).toHaveAttribute('aria-selected', 'false')
    await userEvent.click(cell)
    await userEvent.click(canvasElement)
    await expect(cell).toHaveAttribute('aria-selected', 'false')
  },
}
export const InProgress: Story = { args: { game: inProgress, games: [inProgress] } }
export const OpenOnAnotherDevice: Story = { args: { game: inProgress, games: [inProgress], sharedOnOtherDevice: true } }
export const CatchUpOnAnotherDevice: Story = {
  args: { game: solved, games: [solved, inProgress], catchUpPuzzle: inProgress },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Catch up/ })).toBeVisible()
  },
}
export const GridModeCue: Story = {
  args: { game: inProgress, games: [inProgress] },
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    const highlight = canvas.getByRole('button', { name: 'Highlight mode' })
    await userEvent.click(highlight)
    await expect(grid).toHaveAccessibleDescription('Highlight mode')
    await userEvent.click(highlight)
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    await userEvent.keyboard('q')
    await expect(grid).toHaveAccessibleDescription('Highlight mode')
    await userEvent.keyboard('p')
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.keyboard('q')
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
  },
}
export const InputModeAfterChangingDigits: Story = {
  args: { game: inProgress, games: [inProgress] },
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    await userEvent.keyboard('d0{Shift>}24{/Shift}')
    await expect(grid).toHaveAccessibleDescription('Pen mode')

    await userEvent.keyboard('d')
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.click(canvas.getByRole('button', { name: 'Any selected candidates. Switch to all.' }))
    await expect(grid).toHaveAccessibleDescription('Pen mode')
    await userEvent.keyboard('{Shift>}6{/Shift}')
    await expect(grid).toHaveAccessibleDescription('Pen mode')

    await userEvent.click(canvas.getByRole('button', { name: 'Pencil mode' }))
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
    await userEvent.keyboard('{Shift>}')
    await userEvent.click(canvas.getByRole('button', { name: 'Select 8' }))
    await userEvent.keyboard('{/Shift}')
    await expect(grid).toHaveAccessibleDescription('Pencil mode')

    const highlight = canvas.getByRole('button', { name: 'Highlight mode' })
    await userEvent.click(highlight)
    await userEvent.keyboard('{Shift>}1{/Shift}')
    await expect(grid).toHaveAccessibleDescription('Highlight mode')
    await userEvent.click(highlight)
    await expect(grid).toHaveAccessibleDescription('Pencil mode')
  },
}
export const Paused: Story = {
  args: {
    game: { ...inProgress, paused: true }, games: [{ ...inProgress, paused: true }],
    appearance: { ...DEFAULT_APPEARANCE, showGuides: true },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const stage = canvasElement.querySelector<HTMLElement>('.puzzle-stage')!
    const puzzle = canvasElement.querySelector<HTMLElement>('.puzzle')!
    const stageBefore = stage.getBoundingClientRect()
    const puzzleBefore = puzzle.getBoundingClientRect()

    await userEvent.click(canvas.getAllByRole('button', { name: 'Resume puzzle' }).at(-1)!)
    await canvas.findByRole('grid', { name: 'Sudoku grid' })

    const stageAfter = stage.getBoundingClientRect()
    const puzzleAfter = puzzle.getBoundingClientRect()
    expect(stageAfter.width).toBeCloseTo(stageBefore.width, 2)
    expect(stageAfter.height).toBeCloseTo(stageBefore.height, 2)
    expect(puzzleAfter.width).toBeCloseTo(puzzleBefore.width, 2)
    expect(puzzleAfter.height).toBeCloseTo(puzzleBefore.height, 2)

    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    grid.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
    await userEvent.keyboard(' ')
    await canvas.findByRole('status', { name: 'Puzzle paused' })
    await userEvent.keyboard(' ')
    await canvas.findByRole('grid', { name: 'Sudoku grid' })
  },
}
export const LargeGridText: Story = { args: { appearance: { ...DEFAULT_APPEARANCE, gridTextScale: MAX_GRID_TEXT_SCALE } } }
export const Draft: Story = { args: { game: namedDraft, games: [namedDraft] } }
export const Solved: Story = {
  args: { game: solved, games: [solved] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (canvasElement.querySelector('.mobile-panel-layout')) return
    const toggle = canvas.getByRole('button', { name: 'View grid' })
    const card = toggle.closest('.puzzle')!
    const stage = card.querySelector('.puzzle-stage')!
    const timer = canvas.getByRole('timer')
    const layout = () => [card, stage, toggle, timer].map(element => element.getBoundingClientRect().toJSON())
    await canvasElement.ownerDocument.fonts.ready
    const before = layout()

    await userEvent.click(toggle)
    await expect(toggle).toHaveAccessibleName('View results')
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toBeVisible()
    await expect(layout()).toEqual(before)

    await userEvent.keyboard(' ')
    await expect(toggle).toHaveAccessibleName('View grid')
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Puzzle solved' })).toBeVisible())
    await expect(layout()).toEqual(before)
  },
}

export const SolvedMobile: Story = {
  args: { ...Solved.args, appearance: { ...DEFAULT_APPEARANCE, showGuides: false } },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    if (!canvasElement.querySelector('.mobile-panel-layout')) return
    const toggle = canvas.getByRole('button', { name: 'View grid' })
    const stage = canvasElement.ownerDocument.getElementById(toggle.getAttribute('aria-controls')!)!
    const controls = canvasElement.querySelector('.workspace-controls')!
    const actions = canvas.getByRole('region', { name: 'Next puzzle options' })
    const results = canvas.getByRole('region', { name: 'Solve details' })
    const bounds = (element: Element) => element.getBoundingClientRect().toJSON()
    const layout = () => [toggle, stage, controls].map(bounds)
    const before = layout()
    await expect(bounds(actions)).toEqual(bounds(controls))
    await expect(within(actions).getByRole('button', { name: 'Next easy puzzle' })).toBeVisible()
    await userEvent.click(within(results).getByText('Action history'))
    await expect(layout()).toEqual(before)

    toggle.focus({ preventScroll: true })
    await userEvent.keyboard('{Enter}')
    await expect(toggle).toHaveAccessibleName('View results')
    await expect(toggle).toHaveFocus()
    await expect(canvas.getByRole('grid', { name: 'Sudoku grid' })).toBeVisible()
    await expect(actions).not.toBeVisible()
    await expect(layout()).toEqual(before)

    await userEvent.keyboard('{Enter}')
    await expect(toggle).toHaveAccessibleName('View grid')
    await expect(toggle).toHaveFocus()
    await expect(results).toBeVisible()
    await expect(layout()).toEqual(before)

    await userEvent.click(toggle)
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })).toBeVisible()
    await expect(toggle).toHaveAccessibleName('View results')
    const original = roomStore.getSnapshot().games.find(game => game.id === solved.id)
    expect(original?.position).toEqual(solved.position)
    expect(original?.elapsed).toBe(solved.elapsed)
    await userEvent.click(toggle)
    await expect(within(results).getAllByText('06:27', { exact: true })[0]).toBeVisible()
  },
}

const solvedValues = valuesOf(solved)
const beforeFinalMoves = { ...fillEntries(starter, solvedValues.slice(0, 2) + '00' + solvedValues.slice(4)),
  id: 'solved-with-history', elapsed: solved.elapsed }
const penultimateMove = recordAction(beforeFinalMoves, enter(beforeFinalMoves, [2], 'value', Number(solvedValues[2])),
  'edit', { technique: 'naked-single' })
const solvedWithHistory = recordAction(penultimateMove, enter(penultimateMove, [3], 'value', Number(solvedValues[3])),
  'edit', { technique: 'naked-single' })

export const DesktopPanelsAfterSolve: Story = {
  args: { game: penultimateMove, games: [penultimateMove] },
  beforeEach: ({ args }) => {
    playSession.set(args.game.id, 'toolPanels', { open: ['colors', 'chains'], active: 'chains' })
  },
  render: (args) => <WorktableExample {...args} withTopbar resizable={args.workspaceMode === 'standard'} />,
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    if (canvasElement.querySelector('.mobile-panel-layout')) return
    const advanced = args.workspaceMode === 'advanced'
    const colors = await canvas.findByRole('tab', { name: 'Colors' })
    const chains = canvas.getByRole('tab', { name: 'Chains' })
    const panel = advanced ? chains.closest('.dv-groupview')! : canvas.getByRole('region', { name: 'Puzzle insights' })
    await expect(chains).toHaveAttribute('aria-selected', 'true')
    await canvasElement.ownerDocument.fonts.ready
    const inputLayout = () => [
      canvas.getByRole('region', { name: 'Sudoku controls' }),
      canvas.getByRole('group', { name: 'Digit pad' }),
      canvas.getByRole('button', { name: /^Undo$/ }),
      canvas.getByRole('button', { name: /^Redo$/ }),
      canvas.getByRole('button', { name: 'Pencil mode' }),
      panel,
    ].map(element => element.getBoundingClientRect().toJSON())
    const initialInputLayout = !advanced ? inputLayout() : undefined
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 4, empty/ })
    await userEvent.click(cell)
    await userEvent.keyboard(solvedValues[3])
    await canvas.findByRole('heading', { name: 'Puzzle solved' })
    await expect(panel).toBeVisible()
    if (!advanced) {
      await expect(panel).toHaveAttribute('data-presence', 'open')
      expect(inputLayout()).toEqual(initialInputLayout)
      await userEvent.click(canvas.getByRole('button', { name: /^Undo$/ }))
      const grid = await canvas.findByRole('grid', { name: 'Sudoku grid' })
      const editableGrid = grid.getBoundingClientRect().toJSON()
      expect(inputLayout()).toEqual(initialInputLayout)
      await expect(canvas.getByRole('button', { name: 'Actions' })).toBeVisible()
      await userEvent.click(canvas.getByRole('button', { name: /^Redo$/ }))
      await expect(canvas.getByRole('gridcell', { name: /^Row 1, column 4, digit 6/ })).toBeVisible()
      expect(grid.getBoundingClientRect().toJSON()).toEqual(editableGrid)
      expect(inputLayout()).toEqual(initialInputLayout)
      await expect(canvas.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
      await userEvent.click(canvas.getByRole('button', { name: 'View results' }))
      await canvas.findByRole('heading', { name: 'Puzzle solved' })
      expect(inputLayout()).toEqual(initialInputLayout)
    }
    await expect(chains).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(colors)
    await expect(colors).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('button', { name: 'Light mint' })).toBeDisabled()
  },
}

export const AdvancedPanelsAfterSolve: Story = {
  ...DesktopPanelsAfterSolve,
  args: { ...DesktopPanelsAfterSolve.args, workspaceMode: 'advanced' },
}

export const DesktopPanelsAfterSolveWithGuides: Story = {
  ...DesktopPanelsAfterSolve,
  args: { ...DesktopPanelsAfterSolve.args, appearance: { ...DEFAULT_APPEARANCE, showGuides: true } },
}

export const DesktopPanelsAfterSolveWithBottomControls: Story = {
  ...DesktopPanelsAfterSolve,
  args: { ...DesktopPanelsAfterSolve.args, appearance: { ...DEFAULT_APPEARANCE, puzzleControlsPosition: 'bottom' } },
}

export const UndoCompletedPuzzle: Story = {
  args: { game: solvedWithHistory, games: [solvedWithHistory] },
  play: async ({ canvas, userEvent }) => {
    const result = await canvas.findByRole('region', { name: 'Solve details' })
    await waitFor(() => expect(within(result).getAllByText('06:27', { exact: true })[0]).toBeVisible())
    const undo = canvas.getByRole('button', { name: /^Undo$/ })
    await expect(undo).toBeEnabled()
    await userEvent.click(undo)
    await expect(await canvas.findByRole('gridcell', { name: /^Row 1, column 4, empty/ })).toBeVisible()
    await expect(canvas.getByRole('gridcell', { name: /^Row 1, column 3, digit 4/ })).toBeVisible()
    await expect(canvas.getByRole('timer')).toHaveTextContent('06:27')

    const redo = canvas.getByRole('button', { name: /^Redo$/ })
    await userEvent.click(redo)
    await expect(canvas.getByRole('gridcell', { name: /^Row 1, column 4, digit 6/ })).toBeVisible()
    const toggle = canvas.getByRole('button', { name: 'View results' })
    await userEvent.click(toggle)
    await waitFor(() => expect(canvas.getByRole('region', { name: 'Solve details' })).toBeVisible())
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect(await canvas.findByRole('gridcell', { name: /^Row 1, column 4, empty/ })).toBeVisible()
    await expect(canvas.getByRole('timer')).toHaveTextContent('06:27')

    const original = roomStore.getSnapshot().games.find(game => game.id === solvedWithHistory.id)
    await expect(original?.position).toEqual(solvedWithHistory.position)
    await expect(original?.past).toEqual(solvedWithHistory.past)
    await expect(original?.actionHistory).toEqual(solvedWithHistory.actionHistory)
    await expect(original?.elapsed).toBe(solvedWithHistory.elapsed)
  },
}

export const CandidateShortcut: Story = {
  play: async ({ canvas, userEvent }) => {
    const cell = canvas.getByRole('gridcell', { name: /^Row 1, column 3, empty/ })
    const given = canvas.getAllByRole('gridcell', { name: /given (?!4)[1-9]/ })[0]
    await userEvent.keyboard('d')
    await userEvent.click(given)
    await expect(given).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('4')
    await expect(given).toHaveAttribute('aria-selected', 'false')
    await expect(canvas.getByRole('button', { name: 'Deselect 4' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Meta>}5{/Meta}')
    await expect(cell).toHaveAccessibleName('Row 1, column 3, empty')
    await userEvent.click(cell)
    await expect(cell).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Control>}4{/Control}')
    await expect(cell).toHaveAccessibleName(/^Row 1, column 3, empty, candidates 4/)
    fireEvent.keyDown(cell, { key: "'", code: 'Digit4', metaKey: true })
    await expect(cell).toHaveAccessibleName('Row 1, column 3, empty')
  },
}
export const HintWithGrid: Story = {
  args: { game: paintCells(starter, [{ cell: 2, color: 1 }]) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open puzzle options' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Colors$/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    const viewHint = await canvas.findByRole('button', { name: 'View hint' })
    await waitFor(() => {
      const { left, top, width, height } = viewHint.getBoundingClientRect()
      const hit = viewHint.ownerDocument.elementFromPoint(left + width / 2, top + height / 2)
      expect(viewHint.contains(hit)).toBe(true)
    })
    await userEvent.click(viewHint)
    const hint = await canvas.findByRole('complementary', { name: 'Puzzle hint' }, { timeout: 5000 })
    const outcomeText = /Place [1-9] in|Remove [1-9] from|Remove candidates/
    const more = await within(hint).findByRole('button', { name: 'More detail' }, { timeout: 5000 })
    await expect(within(hint).queryByRole('button', { name: 'Hint visuals' })).not.toBeInTheDocument()
    await expect(hint).not.toHaveTextContent(outcomeText)
    await expect(hint).not.toHaveTextContent(/Look for digit/)
    await expect(canvas.getByRole('group', { name: 'Hint navigation' })).toHaveTextContent('1/10')
    await userEvent.click(more)
    await expect(hint).toHaveTextContent(/Look for digit/)
    await expect(hint).not.toHaveTextContent(outcomeText)
    await expect(hint).not.toHaveTextContent(/Look in/)
    await userEvent.click(more)
    await expect(hint).toHaveTextContent(/Look in|Look at the highlighted cells/)
    await expect(hint).not.toHaveTextContent(outcomeText)
    const coloredCell = canvas.getByRole('gridcell', { name: /^Row 1, column 3,/ })
    const visuals = within(hint).getByRole('button', { name: 'Hint visuals' })
    await expect(visuals).toHaveAttribute('aria-pressed', 'true')
    await expect(coloredCell).not.toHaveClass('color-1')
    await userEvent.click(visuals)
    await expect(visuals).toHaveAttribute('aria-pressed', 'false')
    await expect(coloredCell).toHaveClass('color-1')
    await userEvent.click(more)
    await expect(visuals).toHaveAttribute('aria-pressed', 'false')
    await expect(hint).toHaveTextContent(outcomeText)
    await expect(canvas.getByRole('button', { name: 'Apply hint' })).toBeVisible()
    await userEvent.click(visuals)
    await expect(visuals).toHaveAttribute('aria-pressed', 'true')
    await expect(coloredCell).not.toHaveClass('color-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Next hint' }))
    await expect(more).not.toHaveAttribute('aria-disabled', 'true')
    await expect(visuals).not.toBeInTheDocument()
    await expect(hint).not.toHaveTextContent(outcomeText)
  },
}

const medusaHintGrid = [
  '042609300', '603200005', '000003062', '365080294', '020564713',
  '174932006', '000396027', '236070009', '000025630',
].join('')
const medusaHintNotes = [
  '578 - - - 15 - - 78 18', '- 189 - - 14 78 1489 478 -', '579 1589 1789 78 145 - 49 - -',
  '- - - 17 - 17 - - -', '89 - 89 - - - - - -', '- - - - - - 58 58 -',
  '458 158 18 - - - 148 - -', '- - - 148 - 18 145 45 -', '4789 189 1789 14 - - - - 18',
].join(' ').split(' ').map(notes => notes === '-' ? 0 : [...notes].reduce((mask, digit) => mask | 1 << (Number(digit) - 1), 0))
const medusaHintGame = {
  ...replaceCandidates(makeGame('medusa-hint-location', '3D Medusa', medusaHintGrid, 'generated'), medusaHintNotes, { recordHistory: false }),
  difficulty: 'very-hard' as const, score: 2116,
}

const cleanupNodes = [[13, 1], [13, 4], [22, 4], [24, 4], [24, 9], [15, 9], [10, 9]]
  .map(([cell, digit]) => candidateId({ cell, digit }))
const cleanupLinks = cleanupNodes.slice(1).map((node, index): ChainEdge => [cleanupNodes[index], node])
const chainCleanupGame = {
  ...medusaHintGame, id: 'chain-candidate-cleanup',
  chainSketch: { sketches: [{ ...newChainSketch(1), history: [[], cleanupLinks] }], activeId: 1, pending: null },
}

export const ChainCandidateCleanup: Story = {
  args: { game: chainCleanupGame, games: [chainCleanupGame] },
  beforeEach: () => {
    const selectedDigit = playPreferenceStore.getSnapshot().selectedDigit
    playPreferenceStore.set('selectedDigit', null)
    playSession.set(chainCleanupGame.id, 'toolPanels', { open: ['chains'], active: 'digits' })
    playSession.set(chainCleanupGame.id, 'drawingIntent', false)
    return () => playPreferenceStore.set('selectedDigit', selectedDigit)
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.keyboard('d')
    const grid = within(canvas.getByRole('grid', { name: 'Sudoku grid' }))
    const links = () => canvasElement.querySelector('.board-links')
    const removeOne = async (cell: HTMLElement) => {
      await userEvent.click(cell)
      await userEvent.keyboard('{Control>}1{/Control}')
      await expect(cell).not.toHaveAccessibleName(/candidates (?:\d+, )*1\b/)
      await waitFor(() => expect(links()).not.toBeInTheDocument())
    }
    await waitFor(() => expect(links()).toBeInTheDocument(), { timeout: 5000 })
    // The only elimination is outside the chain. Removing it should still clear the links.
    await removeOne(grid.getByRole('gridcell', { name: /^Row 2, column 7,/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^Undo$/ }))
    await waitFor(() => expect(links()).toBeInTheDocument())
    // Removing a linked candidate should also clear the links.
    await removeOne(grid.getByRole('gridcell', { name: /^Row 2, column 5,/ }))
  },
}

export const MedusaHintStages: Story = {
  args: { game: medusaHintGame, games: [medusaHintGame] },
  beforeEach: () => {
    const saved = playPreferenceStore.getSnapshot().selectedDigit
    playPreferenceStore.set('selectedDigit', 4)
    return () => playPreferenceStore.set('selectedDigit', saved)
  },
  play: async ({ canvas, userEvent }) => {
    const grid = within(canvas.getByRole('grid', { name: 'Sudoku grid' }))
    const unrelatedCell = grid.getByRole('gridcell', { name: /^Row 7, column 1,/ })
    await expect(unrelatedCell).toHaveAccessibleName(/candidate 4 highlighted|highlighted for candidate 4/)
    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
    await canvas.findByRole('button', { name: 'More detail' }, { timeout: 5000 })
    const card = canvas.getByRole('complementary', { name: 'Puzzle hint' })
    const hint = within(card)
    if (!hint.queryByRole('heading', { name: '3D Medusa' })) await userEvent.click(hint.getByRole('button', { name: 'Next hint' }))
    const title = hint.getByRole('heading', { name: '3D Medusa' })
    const more = hint.getByRole('button', { name: 'More detail' })
    const less = hint.getByRole('button', { name: 'Less detail' })
    const geometry = () => {
      const bounds = card.getBoundingClientRect()
      const controls = [title, hint.getByRole('link', { name: /Review .* lesson/ }),
        hint.getByRole('button', { name: 'Close hint' }), hint.getByRole('group', { name: 'Hint navigation' }),
        less, more, card.querySelector('.hint-card-summary :is(.hint-card-visuals, .hint-card-visuals-space)')!,
        card.querySelector('.hint-card-detail-actions .primary')!,
      ].flatMap(element => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return [x - bounds.x, y - bounds.y + card.scrollTop, width, height]
      })
      return [card.offsetLeft, bounds.width, bounds.height, ...controls]
    }
    const initial = geometry()
    const expectStableGeometry = () => geometry().forEach((value, index) => expect(Math.abs(value - initial[index])).toBeLessThan(1))
    const reveal = async (keyboard = false) => {
      if (keyboard) {
        more.focus()
        await userEvent.keyboard('{Enter}')
        await expect(more).toHaveFocus()
      } else await userEvent.click(more)
      expectStableGeometry()
    }
    await expect(less).toHaveAttribute('aria-disabled', 'true')
    await expect(hint.queryByRole('button', { name: 'Apply hint' })).not.toBeInTheDocument()
    await reveal(true)
    await expect(card).toHaveTextContent('Look for digits 1, 4, and 9.')
    await expect(unrelatedCell).not.toHaveAccessibleName(/highlighted/)
    await expect(grid.queryAllByRole('gridcell', { name: /hint cell|hint area/ })).toHaveLength(0)

    await reveal()
    const highlighted = grid.getAllByRole('gridcell', { name: /hint cell|hint area/ }).map(cell => cell.dataset.cell)
    await expect(highlighted).toEqual(['10', '13', '15', '22', '24'])
    await userEvent.click(hint.getByRole('button', { name: 'Hint visuals' }))
    await expect(unrelatedCell).toHaveAccessibleName(/candidate 4 highlighted|highlighted for candidate 4/)
    await userEvent.click(hint.getByRole('button', { name: 'Hint visuals' }))

    await reveal(true)
    await expect(hint.getByRole('heading', { name: 'Remove candidates' })).toBeInTheDocument()
    await expect(more).toHaveAttribute('aria-disabled', 'true')
    await userEvent.tab()
    await expect(hint.getByRole('button', { name: 'Apply hint' })).toHaveFocus()
    await userEvent.click(less)
    await expect(hint.queryByRole('button', { name: 'Apply hint' })).not.toBeInTheDocument()
    expectStableGeometry()
  },
}

export const DesktopHintFits: Story = {
  args: { game: medusaHintGame, games: [medusaHintGame] },
  parameters: { viewport: { options: {
    shortDesktop: { name: 'Short desktop', styles: { width: '1280px', height: '720px' } },
  } } },
  globals: { viewport: { value: 'shortDesktop', isRotated: false } },
  beforeEach: () => {
    const { desktopPanelWidths, pinnedActions } = playPreferenceStore.getSnapshot()
    playPreferenceStore.set('desktopPanelWidths', { puzzle: 560, input: 350 })
    playPreferenceStore.set('pinnedActions', ['hint'])
    return () => {
      playPreferenceStore.set('desktopPanelWidths', desktopPanelWidths)
      playPreferenceStore.set('pinnedActions', pinnedActions)
    }
  },
  render: (args) => <WorktableExample {...args} withTopbar resizable />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const stack = canvasElement.querySelector<HTMLElement>('.standard-puzzle-stack')
    if (!stack) return
    const showHint = await canvas.findByRole('button', { name: /^Hint$/ })
    const puzzle = stack.querySelector('.puzzle')!
    const divider = canvasElement.querySelector('.desktop-layout-divider')!
    const dividerLeft = divider.getBoundingClientRect().left
    const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
    const width = () => grid.getBoundingClientRect().width
    const initialWidth = width()
    async function recordWidths(action: () => Promise<void>) {
      const widths: number[] = []
      let frame = 0
      function record() {
        widths.push(width())
        frame = requestAnimationFrame(record)
      }
      record()
      try {
        await action()
        return widths
      } finally {
        cancelAnimationFrame(frame)
      }
    }
    const openingWidths = await recordWidths(async () => {
      await userEvent.click(showHint)
      await waitFor(() => {
        const hint = canvas.getByRole('complementary', { name: 'Puzzle hint' })
        expect(hint.getBoundingClientRect().bottom).toBeLessThanOrEqual(stack.getBoundingClientRect().bottom + 1)
      })
    })
    const more = await canvas.findByRole('button', { name: 'More detail' }, { timeout: 5000 })
    const card = canvas.getByRole('complementary', { name: 'Puzzle hint' })
    const slot = card.closest('.standard-hint-slot')!
    await Promise.allSettled(slot.getAnimations({ subtree: true }).map(animation => animation.finished))
    const expectFit = () => {
      const bounds = stack.getBoundingClientRect()
      const hintBounds = card.getBoundingClientRect()
      const puzzleBounds = puzzle.getBoundingClientRect()
      expect(grid.getBoundingClientRect().bottom).toBeLessThan(hintBounds.top)
      expect(hintBounds.bottom).toBeLessThanOrEqual(bounds.bottom + 1)
      expect(hintBounds.left).toBeCloseTo(puzzleBounds.left, 0)
      expect(hintBounds.right).toBeCloseTo(puzzleBounds.right, 0)
      expect(hintBounds.right).toBeLessThanOrEqual(divider.getBoundingClientRect().left)
      expect(divider.getBoundingClientRect().left).toBeCloseTo(dividerLeft, 0)
      expect(stack.scrollHeight).toBeLessThanOrEqual(stack.clientHeight + 1)
    }
    await waitFor(expectFit)
    for (let step = 0; step < 3; step++) await userEvent.click(more)
    await expect(canvas.getByRole('button', { name: 'Apply hint' })).toBeVisible()
    expectFit()

    const fittedWidth = width()
    const closingWidths = await recordWidths(async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Close hint' }))
      await waitFor(() => expect(width()).toBeCloseTo(initialWidth, 0))
    })
    if (initialWidth - fittedWidth > 4 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const isInMotion = (value: number) => value < initialWidth - 2 && value > fittedWidth + 2
      expect(openingWidths.some(isInMotion)).toBe(true)
      expect(closingWidths.some(isInMotion)).toBe(true)
    }
  },
}

const hintLayoutGame = { ...starter, id: 'hint-viewport' }
const hintViewports = {
  shortPhone: { name: 'Short phone', styles: { width: '320px', height: '480px' } },
  tallTablet: { name: 'Tall tablet', styles: { width: '590px', height: '1090px' } },
  landscapePhone: { name: 'Landscape phone', styles: { width: '740px', height: '360px' } },
}

function hintViewportStory(viewport: keyof typeof hintViewports): Story {
  return {
    args: { game: hintLayoutGame, games: [hintLayoutGame] },
    parameters: { viewport: { options: hintViewports } },
    globals: { viewport: { value: viewport, isRotated: false } },
    beforeEach: () => {
      const rootStyle = document.documentElement.style
      const durations = ['--motion-standard-duration', '--motion-panel-duration']
        .map(property => [property, rootStyle.getPropertyValue(property)] as const)
      durations.forEach(([property]) => rootStyle.setProperty(property, '0ms'))
      playSession.set(hintLayoutGame.id, 'toolPanels', defaultToolPanels)
      return () => {
        playSession.activate(null)
        durations.forEach(([property, previous]) => {
          if (previous) rootStyle.setProperty(property, previous)
          else rootStyle.removeProperty(property)
        })
      }
    },
    render: (args) => <WorktableExample {...args} withTopbar />,
    play: async ({ canvas, canvasElement, userEvent }) => {
      const page = canvasElement.querySelector<HTMLElement>('.standard-workspace-page')!
      const layout = page.querySelector<HTMLElement>('.mobile-panel-layout')!
      expect(layout).toBeInTheDocument()
      await userEvent.click(canvas.getByRole('button', { name: 'Actions' }))
      await userEvent.click(await canvas.findByRole('button', { name: 'View hint' }))
      await canvas.findByRole('button', { name: 'More detail' }, { timeout: 5000 })
      const cards = Array.from(layout.querySelectorAll<HTMLElement>('[data-mobile-panel]'))
      const grid = canvas.getByRole('grid', { name: 'Sudoku grid' })
      const puzzle = layout.querySelector<HTMLElement>('[data-mobile-panel="puzzle"]')!
      const doc = page.ownerDocument.documentElement
      const tools = TOOL_PANEL_ORDER.filter(panel => panel !== 'rules')
      expect(cards.map(card => card.dataset.mobilePanel).sort()).toEqual(['hint', 'input', 'puzzle'])

      const fitsInside = (rect: DOMRect, container: DOMRect) => rect.width > 0 && rect.height > 0 &&
        rect.top >= container.top - 1 && rect.bottom <= container.bottom + 1 &&
        rect.left >= container.left - 1 && rect.right <= container.right + 1
      const expectLayoutToFit = async (combination: string) => {
        const transitions = layout.getAnimations({ subtree: true })
          .filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity)
        await Promise.allSettled(transitions.map(animation => animation.finished))
        await waitFor(() => {
          const pageBounds = page.getBoundingClientRect()
          expect({
            combination,
            hasHint: layout.hasAttribute('data-fit-hint'),
            pageOverflow: [page.scrollWidth - page.clientWidth > 1, page.scrollHeight - page.clientHeight > 1],
            pageScrollTop: page.scrollTop,
            documentOverflow: [doc.scrollWidth - doc.clientWidth > 1, doc.scrollHeight - doc.clientHeight > 1],
            clippedCards: cards.filter(card => !fitsInside(card.getBoundingClientRect(), pageBounds))
              .map(card => card.dataset.mobilePanel),
            gridFits: fitsInside(grid.getBoundingClientRect(), puzzle.getBoundingClientRect()),
          }).toEqual({
            combination, hasHint: true, pageOverflow: [false, false], pageScrollTop: 0,
            documentOverflow: [false, false], clippedCards: [], gridFits: true,
          })
        }, { interval: 8 })
      }

      for (let mask = 0; mask < 2 ** tools.length; mask++) {
        const open = tools.filter((_, index) => mask & (1 << index))
        for (const active of ['digits', ...open] as const) {
          playSession.set(hintLayoutGame.id, 'toolPanels', { open, active })
          await waitFor(() => {
            expect({
              tabs: Array.from(layout.querySelectorAll('[role="tab"]'), tab => tab.textContent?.toLowerCase()),
              active: layout.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.toLowerCase(),
              hasTabBody: Boolean(layout.querySelector('[role="tabpanel"]:not([inert], [hidden])')?.getClientRects().length),
            }).toEqual(open.length ? { tabs: ['digits', ...open], active, hasTabBody: true }
              : { tabs: [], active: undefined, hasTabBody: false })
          }, { interval: 8 })
          await expectLayoutToFit(`${viewport}: ${open.join(', ')} (${active})`)
        }
      }

      if (viewport === 'shortPhone') {
        await userEvent.click(canvas.getByRole('tab', { name: 'Digits' }))
        const digits = canvas.getByRole('tabpanel', { name: 'Digits' })
        expect(digits.scrollHeight).toBeGreaterThan(digits.clientHeight)
        digits.scrollTop = digits.scrollHeight
        expect(digits.scrollTop).toBeGreaterThan(0)
        expect(page.scrollTop).toBe(0)
      }

      await userEvent.click(canvas.getByRole('tab', { name: 'Digits' }))
      canvas.getByRole('separator', { name: 'Resize puzzle and input panels' }).focus()
      await userEvent.keyboard('{End}')
      await expectLayoutToFit(`${viewport}: resized Digits with all tools open`)
    },
  }
}

export const HintTabsShortPhone = hintViewportStory('shortPhone')
export const HintTabsTallTablet = hintViewportStory('tallTablet')
export const HintTabsLandscapePhone = hintViewportStory('landscapePhone')

export const AnalyzeMoves: Story = {
  args: { workspaceMode: 'advanced' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Analyze all moves' }))
    const navigation = await canvas.findByRole('group', { name: 'Hint navigation' }, { timeout: 5000 })
    const count = Number(navigation.textContent?.split('/')[1])
    await expect(count).toBeGreaterThan(10)
    await userEvent.click(canvas.getByRole('button', { name: 'Next hint' }))
    await expect(navigation).toHaveTextContent(`2/${count}`)
  },
}

function WorktableExample({ withTopbar, resizable, ...args }: ComponentProps<typeof Worktable> & { withTopbar?: boolean; resizable?: boolean }) {
  const room = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot)
  const [height, setHeight] = useState(args.panelHeight)
  const [multi, setMulti] = useState(args.multi)
  const actionsRef = useRef<WorktableActions | null>(null)
  const game = room.games.find(({ id }) => id === room.active) ?? args.game
  const mobile = useMobileLayout()
  const desktopResize = Boolean(resizable && !mobile)
  return <DesktopPlayLayout enabled={desktopResize} className={withTopbar ? 'story-app app-shell' : 'story-app worktable-story'}>
    {withTopbar && <header className="topbar"><div className="topbar-inner"><span className="wordmark">Sudoku</span></div></header>}
    <main id="sudoku-workspace" className="page standard-workspace-page" aria-label="Sudoku workspace"><PlayWorkspace resizable={desktopResize}>
      <Worktable {...args} key={`${game.id}-${game.source}`} game={game} games={room.games}
        actionsRef={actionsRef} panelHeight={height} setPanelHeight={setHeight} multi={multi}
        toggleMulti={() => setMulti((value) => !value)} />
    </PlayWorkspace></main>
  </DesktopPlayLayout>
}
