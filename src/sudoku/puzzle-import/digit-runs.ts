import { normalizeGivens } from '../formats.ts'
import type { ImportResult } from './types.ts'

const DIGIT_RUNS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'

export function digitRuns(code: string, format: string): ImportResult {
  if (/^[0-9.]{81}$/.test(code)) return { givens: normalizeGivens(code) }
  if (!/^[0-9A-Za-x]{1,81}$/.test(code)) throw new Error(`This ${format} link is missing its puzzle grid.`)
  const givens = Array.from(code, (character) => {
    const value = DIGIT_RUNS.indexOf(character)
    return String(value % 10) + '0'.repeat(Math.floor(value / 10))
  }).join('')
  return { givens: normalizeGivens(givens) }
}
