import type { Dispatch, SetStateAction } from 'react'
import { recordAction, type ActionKind } from '../../sudoku/action-history'
import type { CandidateRecovery } from '../../sudoku/candidate-recovery'
import { applyChainDeduction } from '../../sudoku/chain-sketch'
import type { Deduction, DeductionAction } from '../../sudoku/engine'
import { applyDeduction, applyDeductionBatch, completeCandidateMasks, hintEliminations, valuesOf, type Game } from '../../sudoku/game'
import { hintKey } from '../../sudoku/player-rating'
import { matchesHintPosition, type HintPosition } from '../../sudoku/puzzle-help'
import { observeTechniqueActions } from '../../sudoku/technique-history'
import type { AdvancedModes } from '../../sudoku/preferences'
import { restoreCandidate } from '../../sudoku/candidate-recovery'
import type { HintState } from './usePlayHintModel'
import { withRatingHints } from './play-model'

type Edit = (
  transform: (current: Game) => Game,
  kind?: ActionKind,
  options?: { technique?: string; actions?: readonly DeductionAction[] },
) => void

type Options = {
  puzzle: {
    currentPosition: HintPosition
    savedChainSketch: Game['chainSketch']
    savedSubsets: Game['subsetWorkspace']
    savedBranches: Game['branchWorkspace']
    completed: boolean
  }
  state: {
    recovery: CandidateRecovery | undefined
    visibleHint: HintState | null
    deduction: Pick<Deduction, 'actions' | 'technique'> | undefined
    hintCandidates: readonly number[] | undefined
    canApplyChainEdits: boolean
    chainMasks: readonly number[] | null
    chainActions: readonly DeductionAction[]
    chainIds: readonly number[]
    subsetActions?: readonly DeductionAction[]
    subsetMasks: readonly number[] | null
    branchEdits?: { actions: readonly DeductionAction[]; candidates: readonly number[] }
  }
  modes: Pick<AdvancedModes, 'autoRemoveCandidates' | 'autoRemoveCandidateVariants'>
  actions: {
    edit: Edit
    setHint: Dispatch<SetStateAction<HintState | null>>
    setHintRevealed: Dispatch<SetStateAction<boolean>>
    setFailedChainActions: Dispatch<SetStateAction<readonly DeductionAction[] | null>>
    suspendChain: () => void
    focusPuzzleActions: () => void
  }
}

/** Apply puzzle deductions against the position they were derived from. */
export function usePlayHintMutations({ puzzle, state, modes, actions }: Options) {
  const { currentPosition, savedChainSketch, savedSubsets, savedBranches, completed } = puzzle
  const { recovery, visibleHint, deduction, hintCandidates, canApplyChainEdits, chainMasks, chainActions, chainIds, subsetActions, subsetMasks, branchEdits } = state
  const { edit, setHint, setHintRevealed, setFailedChainActions, suspendChain, focusPuzzleActions } = actions

  function applyToCurrentPosition(
    deductionActions: readonly DeductionAction[],
    candidates: readonly number[],
    { hintSnapshot, technique, chainIds, usesSubsets, usesBranches }: {
      hintSnapshot?: HintPosition; technique?: string; chainIds?: readonly number[]; usesSubsets?: boolean; usesBranches?: boolean
    } = {},
  ) {
    let applied = false
    edit(current => {
      if (!matchesHintPosition(current, hintSnapshot ?? currentPosition) ||
        (chainIds && current.chainSketch !== savedChainSketch) ||
        ((chainIds || usesSubsets) && current.subsetWorkspace !== savedSubsets) ||
        (usesBranches && current.branchWorkspace !== savedBranches)) return current
      const apply = usesBranches ? applyDeductionBatch : applyDeduction
      const next = chainIds
        ? applyChainDeduction(current, chainIds, deductionActions, candidates, modes.autoRemoveCandidates, modes.autoRemoveCandidateVariants)
        : apply(current, deductionActions, candidates, modes.autoRemoveCandidates, modes.autoRemoveCandidateVariants)
      applied = next !== current
      if (applied && !hintSnapshot && !completed)
        void observeTechniqueActions(current, deductionActions, 'independent', hintEliminations(
          valuesOf(current), completeCandidateMasks(current), current.position.eliminations
        ))
      return applied && hintSnapshot && !completed ? withRatingHints(next, [hintKey(deductionActions)], true) : next
    }, hintSnapshot ? 'hint' : 'edit', { technique, actions: deductionActions })
    return applied
  }

  function finishHintApplication() {
    setHint(null)
    setHintRevealed(false)
    focusPuzzleActions()
  }

  function applyCandidateRecovery() {
    if (!recovery || !visibleHint) return
    edit(current => matchesHintPosition(current, visibleHint.position) ? restoreCandidate(current, recovery) : current, 'recovery')
    finishHintApplication()
  }

  function applyHint() {
    if (!deduction || !hintCandidates || !visibleHint) return
    applyToCurrentPosition(deduction.actions, hintCandidates, {
      hintSnapshot: visibleHint.position,
      technique: deduction.technique,
    })
    finishHintApplication()
  }

  function applyChainEdits() {
    if (!canApplyChainEdits || !chainMasks) return
    const applied = applyToCurrentPosition(chainActions, chainMasks, { chainIds })
    setFailedChainActions(applied ? null : chainActions)
    if (applied) suspendChain()
  }

  function applySubsetEdits() {
    if (subsetActions?.length && subsetMasks) applyToCurrentPosition(subsetActions, subsetMasks, { usesSubsets: true })
  }

  function applyBranchEdits() {
    if (branchEdits) applyToCurrentPosition(branchEdits.actions, branchEdits.candidates, { usesBranches: true })
  }

  return { applyCandidateRecovery, applyHint, applyChainEdits, applySubsetEdits, applyBranchEdits }
}
