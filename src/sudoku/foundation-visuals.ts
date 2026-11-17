import definitions from './foundation-visuals.json' with { type: 'json' }
import type { BoardAnnotations, BoardLink, BoardRegion, CandidateAnnotation } from '../components/BoardAnnotations'

export type VisualMark = 'pattern' | 'accent' | 'removal' | 'result'
export type VisualKey = VisualMark | 'strong' | 'weak' | 'arrow'
export type VisualBranch = { assumption: string; result: string; children?: VisualBranch[] }
export type VisualStep = {
  title: string
  description: string
  marks?: { cell: number; digit: number; kind: VisualMark }[]
  links?: { from: BoardLink['from']; to: BoardLink['to']; kind: 'strong' | 'weak'; arrow?: boolean }[]
  filled?: Record<string, number>
  candidates?: Record<string, number[]>
  states?: string[]
  notation?: string[]
  active?: number[]
  branches?: VisualBranch[]
}
export type FoundationVisualDefinition = {
  title: string
  note: string
  region?: BoardRegion
  candidates?: Record<string, number[]>
  key: VisualKey[]
  steps: VisualStep[]
}
export type FoundationVisualId = keyof typeof definitions
export const foundationVisuals: Record<FoundationVisualId, FoundationVisualDefinition> = definitions as Record<FoundationVisualId, FoundationVisualDefinition>

export const visualColors: Record<VisualMark, string> = {
  pattern: 'var(--lesson-pattern)', accent: 'var(--lesson-accent)',
  removal: 'var(--lesson-removal)', result: 'var(--lesson-result)',
}

export function foundationBoard(visual: FoundationVisualDefinition, step: VisualStep) {
  const candidates = Array<number>(81).fill(0)
  for (const [cell, digits] of Object.entries(step.candidates ?? visual.candidates ?? {})) {
    candidates[Number(cell)] = digits.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
  }
  const values = Array<string>(81).fill('0')
  for (const [cell, digit] of Object.entries(step.filled ?? {})) values[Number(cell)] = String(digit)
  const marks = new Map<number, Map<number, CandidateAnnotation>>()
  for (const { cell, digit, kind } of step.marks ?? []) {
    const cellMarks = marks.get(cell) ?? new Map<number, CandidateAnnotation>()
    cellMarks.set(digit, { color: visualColors[kind], mark: kind === 'removal' ? 'strike' : 'ring', label: kind })
    marks.set(cell, cellMarks)
  }
  const annotations: BoardAnnotations = {
    candidates: marks,
    links: step.links?.map(({ kind, ...link }) => ({ ...link, color: visualColors.pattern, dashed: kind === 'weak' })),
  }
  return { givens: '0'.repeat(81), values: values.join(''), candidates, annotations }
}
