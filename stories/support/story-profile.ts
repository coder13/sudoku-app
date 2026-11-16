import type { EngineRequest } from '../../src/sudoku/engine'

// Keep engine requests independent of the viewer's saved solver and hint preferences.
export function withSolverProfile(request: EngineRequest) {
  return request
}

export const withHintPreferences = withSolverProfile

export function readDisabledHintTechniques(): string[] {
  return []
}
