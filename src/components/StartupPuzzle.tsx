import { COLORS, EMPTY, type Game } from '../sudoku/game'
import {
  ADVANCED_MODE_KEY, APPEARANCE_KEY, INPUT_SIZE_KEY, MAX_GRID_TEXT_SCALE, MAX_INPUT_SIZE, MIN_GRID_TEXT_SCALE, MIN_INPUT_SIZE,
  type AdvancedModes, type AppearancePreferences,
} from '../sudoku/preferences'
import { ACTIVE_GAME_KEY, GAME_PREFIX, legacyKey } from '../sudoku/storage'
import { Board } from './Board'

const startupOptions = {
  activeKeys: [ACTIVE_GAME_KEY, legacyKey(ACTIVE_GAME_KEY)],
  gamePrefixes: [GAME_PREFIX, legacyKey(GAME_PREFIX)],
  appearanceKey: APPEARANCE_KEY,
  modesKey: ADVANCED_MODE_KEY,
  inputSizeKey: INPUT_SIZE_KEY,
  minInputSize: MIN_INPUT_SIZE,
  maxInputSize: MAX_INPUT_SIZE,
  minScale: MIN_GRID_TEXT_SCALE,
  maxScale: MAX_GRID_TEXT_SCALE,
  colorCount: COLORS.length,
}

// This function runs in the initial HTML, before any module loads. Keep its
// dependencies in the argument so that its source can run on its own.
function restoreStartupPuzzle(options: typeof startupOptions) {
  const controls = document.currentScript?.previousElementSibling as HTMLElement | undefined
  const host = controls?.previousElementSibling?.querySelector('.startup-grid')
  const frame = host?.previousElementSibling?.firstElementChild?.cloneNode(true) as HTMLElement | undefined
  if (!host || !frame || !controls) return

  function read(storage: Storage, keys: string[]) {
    for (const key of keys) {
      const value = storage.getItem(key)
      if (value !== null) return value
    }
    return null
  }

  try {
    const appearance = JSON.parse(localStorage.getItem(options.appearanceKey) ?? 'null') as Partial<AppearancePreferences> | null
    const scale = Number(appearance?.gridTextScale)
    if (Number.isFinite(scale)) {
      frame.style.setProperty('--board-font-scale', String(Math.min(options.maxScale, Math.max(options.minScale, scale))))
    }
    if (appearance?.showGuides === true) {
      frame.classList.remove('guides-hidden')
      for (const axis of ['col', 'row']) {
        const labels = document.createElement('div')
        labels.className = `${axis}-labels`
        for (let digit = 1; digit <= 9; digit++) {
          const label = document.createElement('span')
          label.textContent = String(digit)
          labels.append(label)
        }
        frame.prepend(labels)
      }
    }

    const inputSize = localStorage.getItem(options.inputSizeKey)
    const size = Number(inputSize)
    if (inputSize !== null && Number.isFinite(size)) {
      controls.style.setProperty('--input-size', `${Math.min(options.maxInputSize, Math.max(options.minInputSize, size))}px`)
    }
    const modes = JSON.parse(localStorage.getItem(options.modesKey) ?? 'null') as Partial<AdvancedModes> | null
    const centerCorner = modes?.candidateLayout === 'center-corner'
    controls.toggleAttribute('data-colors', modes?.colorsEnabled === true && (centerCorner || modes.candidateLayout === 'grid'))

    // A shared link will load a different game. The preview stays empty.
    if (/^#(?:puzzle|variant)=/.test(location.hash)) {
      host.replaceChildren(frame)
      return
    }

    let sessionGame: string | null = null
    try { sessionGame = read(sessionStorage, options.activeKeys) } catch { /* Use the local game ID. */ }
    const id = sessionGame ?? read(localStorage, options.activeKeys)
    const game = id ? JSON.parse(read(localStorage, options.gamePrefixes.map((prefix) => prefix + id)) ?? 'null') as Game | null : null
    const digits = /^[0-9]{81}$/
    if (!game || game.id !== id || game.id === 'warmup' || game.source === 'starter' || game.savedForLater ||
      !digits.test(game.givens) || !digits.test(game.position?.entries)) {
      host.replaceChildren(frame)
      return
    }

    const draft = game.source === 'draft'
    controls.toggleAttribute('data-draft', draft)
    if (game.paused && !draft) {
      const panel = document.createElement('div')
      panel.className = 'puzzle-paused'
      const title = document.createElement('h2')
      title.textContent = 'Puzzle paused'
      panel.append(title)
      frame.replaceChildren(panel)
      host.replaceChildren(frame)
      return
    }

    const regions = game.variant?.puzzle.regions
    const regionAt = new Map<number, number>()
    if (regions?.type === 'jigsaw' && Array.isArray(regions.regions)) {
      regions.regions.forEach((region, index) => {
        if (Array.isArray(region)) region.forEach((cell) => regionAt.set(cell, index))
      })
    }
    const jigsaw = regionAt.size === 81
    if (jigsaw) {
      frame.querySelector('.board-body')?.classList.add('variant-board', 'jigsaw-board')
      frame.querySelectorAll('.grid-row').forEach((row) => row.removeAttribute('data-box-edge'))
    }

    function colorClass(color: number | undefined) {
      return color !== undefined && Number.isInteger(color) && color >= 1 && color <= options.colorCount ? `color-${color}` : ''
    }
    const { center, corner, colors, candidateColors, entries } = game.position
    frame.querySelectorAll<HTMLElement>('.cell').forEach((cell, index) => {
      if (jigsaw) {
        cell.removeAttribute('data-box-edge')
        cell.removeAttribute('data-alternate-box')
        if (index % 9 < 8 && regionAt.get(index) !== regionAt.get(index + 1)) cell.dataset.regionRight = 'true'
        if (index < 72 && regionAt.get(index) !== regionAt.get(index + 9)) cell.dataset.regionBottom = 'true'
      }
      const given = game.givens[index]
      const value = given === '0' ? entries[index] : given
      const color = colorClass(colors?.[index])
      if (color) cell.classList.add('colored', color)
      if (value !== '0') {
        cell.classList.toggle('given', given !== '0')
        cell.classList.toggle('entry', given === '0')
        const digit = document.createElement('span')
        digit.textContent = value
        cell.append(digit)
        return
      }

      const centerMask = center?.[index] ?? 0
      const cornerMask = corner?.[index] ?? 0
      function addMarks(mask: number, slotted: boolean) {
        if (!mask) return
        const marks = document.createElement('span')
        marks.className = slotted ? 'candidate-marks' : 'center-marks'
        for (let digit = 1; digit <= 9; digit++) {
          if ((mask & (1 << (digit - 1))) === 0) continue
          const mark = document.createElement('span')
          mark.textContent = String(digit)
          if (slotted) mark.style.gridArea = `${Math.floor((digit - 1) / 3) + 1} / ${(digit - 1) % 3 + 1}`
          const color = colorClass(candidateColors?.[index]?.[digit])
          if (color) mark.classList.add('candidate-color', color)
          marks.append(mark)
        }
        cell.append(marks)
      }
      addMarks(centerCorner ? cornerMask : centerMask | cornerMask, true)
      if (centerCorner) addMarks(centerMask, false)
    })

    // Only this container changes. React hydrates the original grid markup.
    host.replaceChildren(frame)
  } catch { /* The empty grid remains available if storage cannot be read. */ }
}

const startupScript = `(${restoreStartupPuzzle.toString()})(${JSON.stringify(startupOptions)})`

export function StartupPuzzle() {
  return (
    <>
      <div className="puzzle-column startup-puzzle" aria-hidden="true" inert>
        <div className="surface puzzle">
          <div className="puzzle-actions"><span className="icon-button puzzle-menu-trigger" /></div>
          <div className="puzzle-stage">
            <div className="startup-grid-template"><Board givens={EMPTY} values={EMPTY} showGuides={false} /></div>
            <div className="startup-grid" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '' }} />
          </div>
        </div>
      </div>
      <div className="workspace-controls startup-controls" aria-hidden="true" inert suppressHydrationWarning>
        <div className="surface controls compact-controls">
          <div className="controls-content">
            <div className="side-actions">
              <span className="icon-button history-button" /><span className="icon-button history-button" />
              <span className="icon-button startup-play-control" />
            </div>
            <div className="keypad-stack"><div className="keypad" /></div>
            <div className="side-actions">
              <span className="icon-button startup-play-control" /><span className="icon-button startup-play-control" />
              <span className="icon-button startup-play-control" /><span className="icon-button startup-color-control" />
              <span className="icon-button" />
            </div>
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: startupScript }} />
    </>
  )
}
