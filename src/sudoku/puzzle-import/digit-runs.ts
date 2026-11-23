import { normalizeGivens } from '../formats.ts'
import type { ImportResult } from './types.ts'

const DIGIT_RUNS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'

export function decodeDigitRunGrid(code: string, format: string): string {
  if (/^[0-9.]{81}$/.test(code)) return code
  if (!/^[0-9A-Za-x]{1,81}$/.test(code)) throw new Error(`This ${format} link is missing its puzzle grid.`)
  return Array.from(code, (character) => {
    const value = DIGIT_RUNS.indexOf(character)
    return String(value % 10) + '0'.repeat(Math.floor(value / 10))
  }).join('')
}

export function digitRuns(code: string, format: string): ImportResult {
  return { givens: normalizeGivens(decodeDigitRunGrid(code, format)) }
}
