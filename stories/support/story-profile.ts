import type { EngineRequest } from '../../src/sudoku/engine'

export { DISABLED_HINTS_KEY } from '../../src/sudoku/hint-preferences'
export { SOLVER_PROFILE_KEY } from '../../src/sudoku/solver-profile'

export function readSolverProfile(): string[] | undefined { return undefined }

// Keep engine requests independent of the viewer's saved solver and hint preferences.
export function withSolverProfile(request: EngineRequest) {
  return request
}

export const withHintPreferences = withSolverProfile

export function readDisabledHintTechniques(): string[] {
  return []
}
