import { lineGroups } from '../sudoku/line-groups.ts'

const { masks } = lineGroups.entropic
export const availableBands = Uint8Array.from({ length: 512 }, (_, digits) =>
  masks.reduce((groups, mask, index) => digits & mask ? groups | (1 << index) : groups, 0))
export const digitsInBands = Uint16Array.from({ length: 8 }, (_, groups) =>
  masks.reduce((digits, mask, index) => groups & (1 << index) ? digits | mask : digits, 0))
