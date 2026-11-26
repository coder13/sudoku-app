import { IconButton, iconButtonClassName } from './Button'
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react'
import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Eye, Highlighter, Keyboard, Lightbulb, Monitor, Palette, PenTool, Pin, SlidersHorizontal } from 'lucide-react'
import { type ErrorMode } from '../sudoku/game'
import { type CellReferenceStyle } from '../sudoku/hints'
import { puzzleTiming } from '../sudoku/puzzle-timing'
import { type AdvancedModes, type AppearancePreferences, type HighlightPreferences, type WorkspaceMode } from '../sudoku/preferences'
import { syncStepTitles, type SyncStep } from '../sudoku/sync-steps'
import { ChainSwatches } from './ChainsPanel'
import { DeviceSyncSettings } from './DeviceSyncSettings'
import { KeyboardShortcutSettings } from './KeyboardShortcutSettings'
import { Modal } from './Modal'
import { AppearanceSettings } from './SettingsAppearance'
import { GeneralSettings, type GeneralSettingsSection } from './SettingsGeneral'
import { ChainColorSettings, HighlightSettings, PuzzleButtonSettings } from './SettingsPanels'
import { usePlayPreference } from './usePlayPreference'

const sections = [
  { id: 'appearance', label: 'Look & feel', description: 'Theme, grid labels, and sizing', icon: Eye },
  { id: 'input', label: 'Input controls', description: 'Candidates, colors, and selection', icon: PenTool },
  { id: 'solving', label: 'Solving style', description: 'Errors and solving behavior', icon: SlidersHorizontal },
  { id: 'puzzle-buttons', label: 'Puzzle buttons', description: 'Shortcuts pinned below the grid', icon: Pin },
  { id: 'highlighting', label: 'Highlighting', description: 'Cells, digits, and candidates', icon: Highlighter },
  { id: 'chain-colors', label: 'Chain colors', description: 'Color pairs for drawing chains', icon: Palette },
  { id: 'hints', label: 'Hints', description: 'Help while solving', icon: Lightbulb },
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'View and customize key bindings', icon: Keyboard },
  { id: 'device-sync', label: 'Device sync', description: 'Link and manage devices', icon: Monitor },
] as const satisfies readonly { id: string; label: string; description: string; icon: typeof Eye }[]

export type SettingsSection = (typeof sections)[number]['id']
type Section = SettingsSection
const screenLabels = Object.fromEntries(sections.map(({ id, label }) => [id, label])) as Record<Section, string>

declare module '@tanstack/history' {
  interface HistoryState {
    fromSettingsOverview?: boolean
  }
}

function SettingsNavigation({ overview = false }: { overview?: boolean }) {
  return <nav className="settings-tabs" aria-label="Settings sections">
    {sections.map(({ id, label, description, icon: Icon }) => {
      const route = id === 'device-sync' ? { to: '/settings/device-sync' as const, state: { syncBack: overview ? 'settings' as const : undefined } }
        : {
          to: '/settings/$section' as const, params: { section: id },
          state: id === 'shortcuts' ? { fromSettingsOverview: overview } : undefined,
        }
      return <Link key={id} {...route}>
        <span className="settings-menu-icon"><Icon size={18} aria-hidden="true" /></span>
        <span className="settings-nav-copy"><strong>{label}</strong><small>{description}</small></span>
        <ChevronRight className="settings-menu-chevron" size={19} aria-hidden="true" />
      </Link>
    })}
  </nav>
}

const screenIds = new Set<Section>(sections.map(({ id }) => id))

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && screenIds.has(value as Section)
}

type SettingsProps = {
  close: () => void
  section?: SettingsSection | null
  syncStep?: SyncStep | null
  advancedModes: AdvancedModes
  setAdvancedModes: (modes: AdvancedModes) => void
  appearance: AppearancePreferences
  setAppearance: (appearance: AppearancePreferences) => void
  highlighting: HighlightPreferences
  setHighlighting: (highlighting: HighlightPreferences) => void
  errorMode: ErrorMode
  setErrorMode: (mode: ErrorMode) => void
  inputSize: number
  setInputSize: (size: number) => void
  draft: boolean
  cellReferenceStyle: CellReferenceStyle
  setCellReferenceStyle: (style: CellReferenceStyle) => void
  workspaceMode: WorkspaceMode
  setWorkspaceMode?: (mode: WorkspaceMode) => void
  onResetLayout: () => void
}

export function Settings({
  close, section = null, syncStep = null, advancedModes, setAdvancedModes, appearance, setAppearance, highlighting, setHighlighting, errorMode, setErrorMode,
  inputSize, setInputSize, draft, cellReferenceStyle, setCellReferenceStyle, workspaceMode, setWorkspaceMode,
  onResetLayout,
}: SettingsProps) {
  const router = useRouter()
  const [chainColorPairs, setChainColorPairs] = usePlayPreference('chainColorPairs')
  const [pinnedActions, setPinnedActions] = usePlayPreference('pinnedActions')
  const canGoBack = useCanGoBack()
  const { syncBack, fromSettingsOverview } = useLocation({ select: location => location.state })
  const syncing = section === 'device-sync'
  const editingShortcuts = section === 'shortcuts'
  const singlePanel = section !== null
  const heading = useRef<HTMLHeadingElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const wasSinglePanel = useRef(false)

  useEffect(() => {
    if (singlePanel || wasSinglePanel.current) heading.current?.focus({ preventScroll: true })
    wasSinglePanel.current = singlePanel
  }, [section, singlePanel, syncStep])

  const syncParent = syncStep === null ? 'settings'
    : syncStep === 'recover' || (syncStep === 'confirm' && syncBack === 'scan') ? 'scan' : 'start'
  const syncBackLabels = { settings: 'Back to Settings', scan: 'Back to scanner', start: 'Back to Device sync' }

  function backFromSync() {
    if (canGoBack && syncBack === syncParent) router.history.back()
    else if (syncParent === 'settings') void router.navigate({ to: '/settings', replace: true })
    else if (syncParent === 'scan') void router.navigate({
      to: '/settings/device-sync/$step', params: { step: 'scan' }, replace: true,
    })
    else void router.navigate({ to: '/settings/device-sync', replace: true })
  }

  function backFromShortcuts() {
    if (canGoBack && fromSettingsOverview) router.history.back()
    else void router.navigate({ to: '/settings', replace: true })
  }

  const timing = useSyncExternalStore(puzzleTiming.subscribe, puzzleTiming.getSnapshot, puzzleTiming.getServerSnapshot)
  const paperStyleApplied = !timing.showTimer && errorMode === 'none' && advancedModes.keypadProgress === 'off' &&
    !advancedModes.autoGenerateCandidates && !advancedModes.autoRemoveCandidates && !advancedModes.autoPlaceNakedSingles &&
    !advancedModes.doubleClickSingles && !highlighting.relatedCells && !highlighting.matchingDigits && !highlighting.matchingCandidates

  function applyPaperStyle() {
    setAdvancedModes({ ...advancedModes, autoGenerateCandidates: false, autoRemoveCandidates: false,
      autoPlaceNakedSingles: false, doubleClickSingles: false, keypadProgress: 'off' })
    setHighlighting({ ...highlighting, relatedCells: false, matchingDigits: false, matchingCandidates: false })
    setErrorMode('none')
    puzzleTiming.set('showTimer', false)
  }

  function exitSettings(callback?: () => void) {
    close()
    callback?.()
  }

  function renderGeneral(currentSection: GeneralSettingsSection) {
    return <GeneralSettings section={currentSection} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
      errorMode={errorMode} setErrorMode={setErrorMode} draft={draft}
      cellReferenceStyle={cellReferenceStyle} setCellReferenceStyle={setCellReferenceStyle}
      onApplyPaperStyle={applyPaperStyle} paperStyleApplied={paperStyleApplied} />
  }

  const sectionRenderers: Record<Exclude<Section, 'device-sync'>, () => ReactNode> = {
    appearance: () => <AppearanceSettings appearance={appearance} setAppearance={setAppearance} inputSize={inputSize}
      setInputSize={setInputSize} workspaceMode={workspaceMode} setWorkspaceMode={setWorkspaceMode} onResetLayout={onResetLayout} />,
    input: () => renderGeneral('input'),
    solving: () => renderGeneral('solving'),
    hints: () => renderGeneral('hints'),
    'puzzle-buttons': () => <PuzzleButtonSettings pinned={pinnedActions} setPinned={setPinnedActions} />,
    highlighting: () => <HighlightSettings highlighting={highlighting} setHighlighting={setHighlighting} />,
    'chain-colors': () => <ChainColorSettings pairs={chainColorPairs} setPairs={setChainColorPairs} />,
    shortcuts: () => <KeyboardShortcutSettings />,
  }
  function renderSection(screen: Exclude<Section, 'device-sync'>) { return sectionRenderers[screen]() }

  const title = syncing && syncStep ? syncStepTitles[syncStep] : section ? screenLabels[section] : 'Settings'
  return (
    <Modal title={title} titleRef={heading} onClose={() => exitSettings()} data-settings-dialog
      className={`settings-dialog ${section ? 'settings-subscreen' : ''}`}
      leading={syncing ? (
        <IconButton className="settings-header-back"
          aria-label={syncBackLabels[syncParent]}
          onClick={backFromSync}><ChevronLeft size={21} /></IconButton>
      ) : editingShortcuts ? (
        <IconButton className="settings-header-back" aria-label="Back to Settings" onClick={backFromShortcuts}>
          <ChevronLeft size={21} />
        </IconButton>
      ) : section ? (
        <Link to="/settings" className={iconButtonClassName('secondary', 'settings-header-back')} aria-label="Back to Settings">
          <ChevronLeft size={21} />
        </Link>
      ) : undefined}>
      <div className={`settings-layout${singlePanel ? ' settings-single-panel' : ''}`}>
        <SettingsNavigation overview={section === null} />
        <div ref={settingsPanelRef} className="settings-panel motion-screen" key={section ?? 'overview'}>
          {syncing ? <DeviceSyncSettings step={syncStep} onBack={backFromSync} menuBoundaryRef={settingsPanelRef} />
            : section ? renderSection(section)
              : <div className="settings-overview"><h3>Settings</h3><p>Choose a section to configure the app.</p></div>}
        </div>
      </div>

    </Modal>
  )
}
