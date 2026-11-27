/** Return the canonical spelling used by Sudoku Coach's case-insensitive Base32hex decoder. */
export function canonicalCoachCode(code: string) {
  return code.replace(/^SCv([0-9]+)_([0-9]+)_(.*)$/i, (_match, version, encoding, data: string) =>
    `SCv${version}_${encoding}_${data.replace(/[A-V]/g, letter => letter.toLowerCase())}`)
}
