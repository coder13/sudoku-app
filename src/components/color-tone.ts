import type { CSSProperties } from 'react'
import { COLOR_TONES } from '../sudoku/game'

const COLOR_TONE_INKS = [
  ['#9e3b62', '#ffbad1'], ['#98501e', '#ffcba3'], ['#786013', '#f5e18a'],
  ['#276a49', '#b4ebcf'], ['#335b95', '#bedbff'], ['#704c9c', '#dbc1ff'],
  ['#7d2043', '#ef91b4'], ['#793707', '#f2a56d'], ['#5d4905', '#d6bd4d'],
  ['#175234', '#7ecda2'], ['#21457c', '#8cbbf7'], ['#563481', '#b59ae7'],
] as const

/** Return the shared fill tone for a saved color ID. */
export function colorTone(color: number | undefined) {
  return color === undefined ? undefined : COLOR_TONES[color - 1]
}

/** Project the saved color palette into the CSS token used by painted surfaces. */
export function colorToneStyle(color: number | undefined): CSSProperties | undefined {
  const tone = colorTone(color)
  const inks = color === undefined ? undefined : COLOR_TONE_INKS[color - 1]
  return tone && inks
    ? { '--tone': tone, '--tone-ink': `light-dark(${inks[0]}, ${inks[1]})` } as CSSProperties
    : undefined
}
