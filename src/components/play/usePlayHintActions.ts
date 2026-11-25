import type { Dispatch, RefObject, SetStateAction } from 'react'
import { findCandidateRecovery } from '../../sudoku/candidate-recovery'
import { EngineError, type EngineSession } from '../../sudoku/engine'
import { hintEliminations, type Game } from '../../sudoku/game'
import { HINT_CANDIDATES_ERROR, HINT_ERROR, moveHintIndex, moveHintStage, techniqueLabel } from '../../sudoku/hints'
import { puzzleHintPage, puzzleHints, type HintPosition } from '../../sudoku/puzzle-help'
import { solveMini } from '../../sudoku/mini-play'
import type { HintState } from './usePlayHintModel'
import type { PuzzleTask } from './usePlayPuzzleTasks'

type HintTaskActions = {
  beginPuzzleTask: (hint?: boolean, isolated?: boolean) => PuzzleTask
  currentTaskGame: (current: PuzzleTask) => Game | undefined
  finishPuzzleTask: (current: PuzzleTask, keepHintCollection?: boolean) => void
  hasActiveTask: () => boolean
  nextTechniqueHintRequest: () => number
  isTechniqueHintRequestCurrent: (request: number) => boolean
  nextHintPageRequest: () => number
  activeHintEngine: () => EngineSession | null
  isHintPageRequestCurrent: (request: number, engine: EngineSession) => boolean
}

type Options = {
  puzzle: {
    game: Game
    values: string
    displayedCandidates: readonly number[] | null
    eliminations: readonly number[] | undefined
    position: HintPosition
    gridSize: number
  }
  state: {
    hintCount: number
    busy: boolean
    solved: boolean
    draft: boolean
    disabled: boolean
    mobile: boolean
    visibleHint: HintState | null
  }
  host: {
    advancedWorkspace: boolean
    showBottomPanel: boolean
  }
  focus: {
    returnTarget: RefObject<HTMLElement | null>
    actionsButton: RefObject<HTMLButtonElement | null>
    activeInputTab: RefObject<HTMLButtonElement | null>
  }
  actions: {
    setHint: Dispatch<SetStateAction<HintState | null>>
    setHintRevealed: Dispatch<SetStateAction<boolean>>
    suspendDrawing: () => void
    closePuzzleMenu: () => void
    closeActions: () => void
    openHintPanel: () => void
    focusHint: () => void
  }
  tasks: HintTaskActions
}

let nextHintCollection = 0

/** Own hint generation and paging while leaving placement and modal behavior to the Play host. */
export function usePlayHintActions({
  puzzle: { game, values, displayedCandidates, eliminations, position: hintPosition, gridSize },
  state: { hintCount, busy, solved, draft, disabled, mobile, visibleHint },
  host: { advancedWorkspace, showBottomPanel },
  focus: { returnTarget: hintReturnFocus, actionsButton, activeInputTab },
  actions: { setHint, setHintRevealed, suspendDrawing, closePuzzleMenu, closeActions, openHintPanel, focusHint },
  tasks,
}: Options) {
  function prepareHint() {
    suspendDrawing()
    if (advancedWorkspace) {
      if (!showBottomPanel) openHintPanel()
      focusHint()
    }
    setHint(null)
    closePuzzleMenu()
    closeActions()
    setHintRevealed(true)
  }

  async function showHint(limit: 10 | 'all' = 10) {
    if (busy || tasks.hasActiveTask() || solved || draft || disabled) return
    if (mobile) hintReturnFocus.current = actionsButton.current
    prepareHint()
    const task = tasks.beginPuzzleTask(true)
    const run = task.engine.run
    const requestId = tasks.nextTechniqueHintRequest()
    let result: HintState | undefined
    const removals = hintEliminations(values, displayedCandidates, eliminations, gridSize)
    try {
      const collection = limit === 'all' && !game.grid ? ++nextHintCollection : undefined
      const { choices, candidates, available, offset } = await puzzleHints(game, limit, undefined, collection, run)
      const page = collection === undefined ? undefined : { collection, offset: offset ?? 0, available }
      if (!candidates) throw new Error('Missing hint candidates')
      result = { position: hintPosition, choices, candidates, page, index: 0, stage: 'technique' }
    } catch (error) {
      if (!tasks.currentTaskGame(task)) return
      const incorrectCandidates = error instanceof EngineError &&
        (error.code === 'invalid-eliminations' ||
          (error.code === 'unsolvable' && game.variant && [...values].every((digit, cell) => digit === '0' || digit === game.variant!.solution[cell])))
      result = {
        position: hintPosition,
        choices: [],
        index: 0,
        stage: 'technique',
        error: incorrectCandidates ? HINT_CANDIDATES_ERROR : HINT_ERROR,
      }
      if (incorrectCandidates && removals) {
        try {
          const answer = game.sized?.solution ?? game.algebraic?.solution ?? game.variant?.solution ??
            (game.grid ? await solveMini(values, run) : await run({ type: 'solve', values }))
          if (answer) result.recovery = findCandidateRecovery(game, answer, removals)
        } catch {
          // Keep the general candidate warning if recovery cannot be verified.
        }
      }
    } finally {
      if (result && tasks.isTechniqueHintRequestCurrent(requestId) && tasks.currentTaskGame(task)) setHint(result)
      tasks.finishPuzzleTask(task, Boolean(result?.page && tasks.currentTaskGame(task)))
    }
  }

  async function showTechniqueHints(technique: string) {
    if (disabled || busy || tasks.hasActiveTask() || solved || draft) return
    if (mobile) hintReturnFocus.current = activeInputTab.current
    prepareHint()
    const position = hintPosition
    const task = tasks.beginPuzzleTask(true)
    const request = tasks.nextTechniqueHintRequest()
    let result: HintState | undefined
    try {
      const { choices, candidates } = await puzzleHints(game, 'all', technique, undefined, task.engine.run)
      if (!candidates) throw new Error('Missing candidates for the selected technique.')
      result = {
        position,
        choices,
        candidates,
        index: 0,
        stage: 'technique',
        ...(choices.length ? {} : { error: { title: techniqueLabel(technique), text: 'No patterns are available in the current grid.' } }),
      }
    } catch (error) {
      if (!tasks.currentTaskGame(task)) return
      result = {
        position,
        choices: [],
        index: 0,
        stage: 'technique',
        error: error instanceof EngineError && error.code === 'invalid-eliminations' ? HINT_CANDIDATES_ERROR : HINT_ERROR,
      }
    } finally {
      if (result && tasks.isTechniqueHintRequestCurrent(request) && tasks.currentTaskGame(task)) setHint(result)
      tasks.finishPuzzleTask(task)
    }
  }

  async function moveHint(offset: -1 | 1) {
    if (!visibleHint || !hintCount) return
    const request = tasks.nextHintPageRequest()
    const { page } = visibleHint
    const index = moveHintIndex(visibleHint.index, hintCount, offset)
    if (index === visibleHint.index) return
    if (!page || (index >= page.offset && index < page.offset + visibleHint.choices.length)) {
      setHint(current => current === visibleHint ? { ...current, index, stage: 'technique' } : current)
      return
    }
    const engine = tasks.activeHintEngine()
    if (!engine) return
    try {
      const next = await puzzleHintPage(game.variant, page.collection, index, engine.run, game.position.entries)
      if (!tasks.isHintPageRequestCurrent(request, engine)) return
      setHint(current => current?.page?.collection === page.collection
        ? { ...current, choices: next.choices, page: { ...page, offset: next.offset }, index, stage: 'technique' }
        : current)
    } catch (error) {
      if (tasks.isHintPageRequestCurrent(request, engine))
        setHint(current => current?.page?.collection === page.collection
          ? {
              ...current,
              choices: [],
              page: undefined,
              index: 0,
              error: { title: 'Could not load hint', text: (error as Error).message },
            }
          : current)
    }
  }

  function changeHintDetail(offset: -1 | 1) {
    setHint(current => {
      if (!current) return current
      const stage = moveHintStage(current.stage, offset, Boolean(current.recovery))
      return stage === current.stage ? current : {
        ...current,
        stage,
        reviewingRemoval: stage === 'technique' ? false : current.reviewingRemoval,
      }
    })
  }

  return { showHint, showTechniqueHints, moveHint, changeHintDetail }
}
