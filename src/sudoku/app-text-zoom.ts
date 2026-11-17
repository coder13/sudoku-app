export const DEFAULT_APP_TEXT_ZOOM = 100
export const MIN_APP_TEXT_ZOOM = 75
export const MAX_APP_TEXT_ZOOM = 125
const APP_TEXT_ZOOM_STEP = 5

export function clampAppTextZoom(zoom: number) {
  return Math.min(MAX_APP_TEXT_ZOOM, Math.max(MIN_APP_TEXT_ZOOM, zoom))
}

export function stepAppTextZoom(zoom: number, direction: -1 | 0 | 1) {
  return direction === 0 ? DEFAULT_APP_TEXT_ZOOM : clampAppTextZoom(zoom + direction * APP_TEXT_ZOOM_STEP)
}
