import { useMemo } from 'react'
import { replayStep } from '../../sudoku/engine'
import type { Game } from '../../sudoku/game'
import { describeHint, type CellReferenceStyle, type PuzzleHint } from '../../sudoku/hints'
import { lessonDiagram } from '../../sudoku/lesson-diagram'
import { techniqueDifficulties } from '../../sudoku/technique-difficulties'
import { isChainStep } from './play-model'
import {
  solutionCompletionSummary, solutionEndIndex, solutionEndSummary, solutionStatus,
  type SolutionPathState,
} from '../SolutionPath'
import { fogView } from '../../sudoku/fog'

type Options = {
  solutionPath: SolutionPathState | null
  selectedStep: number
  previewing: boolean
  variant: Game['variant']
  grid?: Game['grid']
  gridSize: number
  cellReferenceStyle: CellReferenceStyle
}

/** Resolve the selected solution step and all content shared by the walkthrough and board preview. */
export function usePlaySolutionModel({
  solutionPath, selectedStep, previewing, variant, grid, gridSize, cellReferenceStyle,
}: Options) {
  const trace = solutionPath?.status === 'ready' ? solutionPath.trace : undefined
  const solutionStep = Math.min(selectedStep, trace ? solutionEndIndex(trace) : 0)
  const exactPosition = trace && 'exactPosition' in trace && solutionStep > trace.steps.length ? trace.exactPosition : undefined
  const previewPosition = exactPosition ?? trace?.positions?.[solutionStep]
  const exactFogSolution = trace && 'exact' in trace && trace.exact && solutionStep === trace.steps.length
  const solutionFog = previewing && !exactFogSolution ? fogView(variant, previewPosition?.entries) : undefined
  const replayedSolutionStep = useMemo(() => trace && replayStep(trace, solutionStep), [trace, solutionStep])
  const solutionStepDifficulty = replayedSolutionStep ? techniqueDifficulties[replayedSolutionStep.deduction.technique] : undefined
  const stepDiagram = useMemo(() => {
    const step = replayedSolutionStep
    if (!step?.before.candidates || !step.before.pattern) return undefined
    return lessonDiagram({ deduction: step.deduction, candidates: step.before.candidates }, step.before.pattern,
      { cellReferenceStyle, difficulty: solutionStepDifficulty, grid })
  }, [replayedSolutionStep, cellReferenceStyle, solutionStepDifficulty, grid])
  const chainInspection = previewing && replayedSolutionStep && isChainStep(replayedSolutionStep.deduction)
    ? { deduction: replayedSolutionStep.deduction, links: stepDiagram?.annotations.links ?? [], explanation: stepDiagram?.reason,
      cellReferenceStyle, difficulty: solutionStepDifficulty }
    : undefined
  const solutionHintCopy: PuzzleHint | null = replayedSolutionStep
    ? describeHint(replayedSolutionStep.deduction, { difficulty: solutionStepDifficulty, cellReferenceStyle, gridSize })
    : exactPosition && trace ? solutionCompletionSummary(trace)
      : trace && solutionStep === trace.steps.length
        ? solutionEndSummary(solutionStatus(trace), exactFogSolution || undefined, Boolean('completionProof' in trace && trace.completionProof))
        : null

  return {
    trace, solutionStep, previewPosition, solutionFog,
    replayedSolutionStep, solutionStepDifficulty, stepDiagram, chainInspection, solutionHintCopy,
  }
}
