import { colorTone } from './color-tone'

export function colorCursor(color: number) {
  const tone = colorTone(color)
  if (!tone) return undefined
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><path d="M2 2v25l6.4-6.2 4.5 9.1 3.7-1.8-4.5-9.1 9.1-.3z" fill="#fff" stroke="#211b25" stroke-width="2" stroke-linejoin="round"/><rect x="21" y="20" width="13" height="13" rx="1.5" fill="${tone}" stroke="#211b25" stroke-width="1.5"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, auto`
}
