import { lineGroups } from '../sudoku/line-groups.ts'

function digitGroupTables(masks: readonly number[]) {
  return {
    available: Uint8Array.from({ length: 512 }, (_, digits) =>
      masks.reduce((groups, mask, index) => digits & mask ? groups | (1 << index) : groups, 0)),
    digits: Uint16Array.from({ length: 8 }, (_, groups) =>
      masks.reduce((digits, mask, index) => groups & (1 << index) ? digits | mask : digits, 0)),
  }
}

export const latinDigitGroups = {
  entropic: digitGroupTables(lineGroups.entropic.masks),
  modular: digitGroupTables(lineGroups.modular.masks),
}
