import { readFileSync } from 'node:fs'
import type { VariantPuzzle } from '../../src/sudoku/engine.ts'

export type MixedFixture = { puzzle: VariantPuzzle; solution: string; coach: string; fpuzzles: string }
export const mixedFixtures = JSON.parse(readFileSync(new URL('../fixtures/mixed-puzzles.json', import.meta.url), 'utf8')) as Record<string, MixedFixture>
