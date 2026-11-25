// Mirrors the .color-N --tone values in styles.css; native cursor images cannot read page CSS variables.
export const COLOR_CURSOR_TONES = ['#f5c7d4', '#f7d4b8', '#f8e8a8', '#c4ebd4', '#cce1fc', '#e3d2fa', '#e285a2', '#eaa065', '#e0bf4b', '#73bd95', '#83afe9', '#ae91da']

export function colorCursor(color: number) {
  const tone = COLOR_CURSOR_TONES[color - 1]
  if (!tone) return undefined
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><path d="M2 2v25l6.4-6.2 4.5 9.1 3.7-1.8-4.5-9.1 9.1-.3z" fill="#fff" stroke="#211b25" stroke-width="2" stroke-linejoin="round"/><rect x="21" y="20" width="13" height="13" rx="1.5" fill="${tone}" stroke="#211b25" stroke-width="1.5"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, auto`
}
