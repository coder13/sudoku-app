export const GRID_TEXT_SCALE_AT_100_PERCENT = 1.5
export const DEFAULT_GRID_TEXT_SCALE = GRID_TEXT_SCALE_AT_100_PERCENT * 0.75
export const MIN_GRID_TEXT_SCALE = GRID_TEXT_SCALE_AT_100_PERCENT * 0.5
export const MAX_GRID_TEXT_SCALE = GRID_TEXT_SCALE_AT_100_PERCENT
export const GRID_TEXT_SCALE_STEP = GRID_TEXT_SCALE_AT_100_PERCENT * 0.05

export function clampGridTextScale(value: unknown) {
  const scale = Number(value)
  return Number.isFinite(scale)
    ? Math.min(MAX_GRID_TEXT_SCALE, Math.max(MIN_GRID_TEXT_SCALE, scale))
    : DEFAULT_GRID_TEXT_SCALE
}

export function gridTextScalePercentage(scale: number) {
  return Math.round(scale / GRID_TEXT_SCALE_AT_100_PERCENT * 100)
}

export function stepGridTextScale(scale: number, direction: -1 | 1) {
  const next = Math.round((scale + direction * GRID_TEXT_SCALE_STEP) * 1000) / 1000
  return clampGridTextScale(next)
}
