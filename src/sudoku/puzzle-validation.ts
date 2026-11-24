import type { Analysis } from './engine.ts'

export type CheckResult = { text: string; tone: 'error' | 'success' | 'neutral' }

export const validation: Record<Analysis, CheckResult> = {
  conflict: { text: 'Resolve the highlighted conflicts first.', tone: 'error' },
  unsolvable: { text: 'The current grid has no solution.', tone: 'error' },
  unique: { text: 'This puzzle has exactly one solution.', tone: 'success' },
  multiple: { text: 'This puzzle has multiple solutions.', tone: 'neutral' },
  'search-limit': { text: 'The engine reached its search limit before it could verify this puzzle.', tone: 'neutral' },
}

export const originalSolutionStatus = {
  checking: 'Checking solutions…',
  unique: 'Unique solution',
  multiple: 'Multiple solutions',
  unsolvable: 'No solution',
  conflict: 'Conflicting givens or rules',
  'search-limit': 'Uniqueness unverified',
  unverified: 'Uniqueness unverified',
} as const
