import type { VariantConstructionBank } from './checked-variant-puzzles.ts'
import type { VariantRule } from './engine.ts'
import { EMPTY } from './game.ts'
import { clueDelta } from './outside-clues.ts'

function killer(parts: readonly (readonly [sum: number, ...cells: number[]])[]): VariantRule {
  return { type: 'killer-cages', coverGrid: true, cages: parts.map(([sum, ...cells]) => ({ sum, cells })) }
}

function xSum(first: number, direction: Extract<VariantRule, { type: 'x-sum' }>['direction'], sum: number): VariantRule {
  const [row, column] = clueDelta(direction)
  const cells = Array.from({ length: 9 }, (_, offset) => first + offset * (9 * row + column))
  return { type: 'x-sum', cells, direction, sum }
}

function littleKiller(first: number, direction: Extract<VariantRule, { type: 'little-killer' }>['direction'],
  length: number, sum: number): VariantRule {
  const [row, column] = clueDelta(direction)
  const cells = Array.from({ length }, (_, offset) => first + offset * (9 * row + column))
  return { type: 'little-killer', cells, direction, sum }
}

function skyscraper(first: number, direction: Extract<VariantRule, { type: 'skyscrapers' }>['direction'], count: number): VariantRule {
  const [row, column] = clueDelta(direction)
  const cells = Array.from({ length: 9 }, (_, offset) => first + offset * (9 * row + column))
  return { type: 'skyscrapers', cells, direction, count }
}

function inequalities(sides: readonly (readonly [number, number])[]): VariantRule[] {
  return sides.map(([less, greater]) => ({ type: 'inequality', less, greater }))
}

function arrows(paths: readonly (readonly [number, ...number[]])[]): VariantRule[] {
  return paths.map(([circle, ...cells]) => ({ type: 'arrow', circle, cells }))
}

function regionSums(paths: readonly (readonly number[])[]): VariantRule[] {
  return paths.map(cells => ({ type: 'region-sum', cells }))
}

// Reproducible starting layouts for grades that are costly to find by carving.
// Generation rechecks uniqueness, difficulty, rule evidence and play history.
export const checkedMiraclePuzzles: VariantConstructionBank = {
  'adjacent-total': {
    'hard': [
      { givens: EMPTY, rules: [
        { cells: [11, 12], sum: 7, type: 'adjacent-total' }, { cells: [25, 34], sum: 15, type: 'adjacent-total' }, { cells: [57, 66], sum: 9, type: 'adjacent-total' },
        { cells: [18, 19], sum: 9, type: 'adjacent-total' }, { cells: [42, 51], sum: 11, type: 'adjacent-total' }, { cells: [50, 59], sum: 8, type: 'adjacent-total' },
        { cells: [32, 33], sum: 8, type: 'adjacent-total' }, { cells: [10, 19], sum: 8, type: 'adjacent-total' }, { cells: [27, 28], sum: 16, type: 'adjacent-total' },
        { cells: [33, 34], sum: 11, type: 'adjacent-total' }, { cells: [6, 7], sum: 7, type: 'adjacent-total' }, { cells: [4, 5], sum: 13, type: 'adjacent-total' },
        { cells: [1, 2], sum: 13, type: 'adjacent-total' }, { cells: [27, 36], sum: 13, type: 'adjacent-total' }, { cells: [40, 49], sum: 15, type: 'adjacent-total' },
        { cells: [73, 74], sum: 17, type: 'adjacent-total' }, { cells: [6, 15], sum: 15, type: 'adjacent-total' }, { cells: [9, 18], sum: 13, type: 'adjacent-total' },
        { cells: [60, 69], sum: 9, type: 'adjacent-total' }, { cells: [54, 55], sum: 9, type: 'adjacent-total' }, { cells: [57, 58], sum: 4, type: 'adjacent-total' },
        { cells: [37, 38], sum: 6, type: 'adjacent-total' }, { cells: [15, 16], sum: 13, type: 'adjacent-total' },
      ] },
      { givens: EMPTY, rules: [
        { cells: [11, 12], sum: 7, type: 'adjacent-total' }, { cells: [25, 34], sum: 15, type: 'adjacent-total' }, { cells: [57, 66], sum: 9, type: 'adjacent-total' },
        { cells: [18, 19], sum: 9, type: 'adjacent-total' }, { cells: [42, 51], sum: 11, type: 'adjacent-total' }, { cells: [18, 27], sum: 15, type: 'adjacent-total' },
        { cells: [50, 59], sum: 8, type: 'adjacent-total' }, { cells: [32, 33], sum: 8, type: 'adjacent-total' }, { cells: [10, 19], sum: 8, type: 'adjacent-total' },
        { cells: [27, 28], sum: 16, type: 'adjacent-total' }, { cells: [33, 34], sum: 11, type: 'adjacent-total' }, { cells: [6, 7], sum: 7, type: 'adjacent-total' },
        { cells: [4, 5], sum: 13, type: 'adjacent-total' }, { cells: [1, 2], sum: 13, type: 'adjacent-total' }, { cells: [27, 36], sum: 13, type: 'adjacent-total' },
        { cells: [40, 49], sum: 15, type: 'adjacent-total' }, { cells: [73, 74], sum: 17, type: 'adjacent-total' }, { cells: [6, 15], sum: 15, type: 'adjacent-total' },
        { cells: [9, 18], sum: 13, type: 'adjacent-total' }, { cells: [60, 69], sum: 9, type: 'adjacent-total' }, { cells: [54, 55], sum: 9, type: 'adjacent-total' },
        { cells: [57, 58], sum: 4, type: 'adjacent-total' }, { cells: [37, 38], sum: 6, type: 'adjacent-total' }, { cells: [15, 16], sum: 13, type: 'adjacent-total' },
      ] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        { cells: [50, 59], sum: 17, type: 'adjacent-total' }, { cells: [14, 23], sum: 9, type: 'adjacent-total' }, { cells: [60, 61], sum: 9, type: 'adjacent-total' },
        { cells: [34, 35], sum: 9, type: 'adjacent-total' }, { cells: [69, 78], sum: 8, type: 'adjacent-total' }, { cells: [31, 32], sum: 12, type: 'adjacent-total' },
        { cells: [52, 53], sum: 7, type: 'adjacent-total' }, { cells: [76, 77], sum: 11, type: 'adjacent-total' }, { cells: [70, 71], sum: 9, type: 'adjacent-total' },
        { cells: [32, 33], sum: 11, type: 'adjacent-total' }, { cells: [34, 43], sum: 11, type: 'adjacent-total' }, { cells: [22, 31], sum: 6, type: 'adjacent-total' },
        { cells: [53, 62], sum: 8, type: 'adjacent-total' }, { cells: [70, 79], sum: 14, type: 'adjacent-total' }, { cells: [51, 60], sum: 9, type: 'adjacent-total' },
        { cells: [66, 67], sum: 4, type: 'adjacent-total' }, { cells: [52, 61], sum: 3, type: 'adjacent-total' }, { cells: [10, 11], sum: 4, type: 'adjacent-total' },
        { cells: [65, 66], sum: 9, type: 'adjacent-total' }, { cells: [21, 22], sum: 8, type: 'adjacent-total' }, { cells: [29, 38], sum: 3, type: 'adjacent-total' },
        { cells: [45, 54], sum: 8, type: 'adjacent-total' }, { cells: [47, 56], sum: 13, type: 'adjacent-total' }, { cells: [15, 16], sum: 13, type: 'adjacent-total' },
        { cells: [61, 62], sum: 4, type: 'adjacent-total' },
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        { cells: [9, 18], sum: 14, type: 'adjacent-total' }, { cells: [57, 66], sum: 12, type: 'adjacent-total' }, { cells: [12, 13], sum: 7, type: 'adjacent-total' },
        { cells: [22, 23], sum: 12, type: 'adjacent-total' }, { cells: [38, 39], sum: 9, type: 'adjacent-total' }, { cells: [63, 72], sum: 15, type: 'adjacent-total' },
        { cells: [35, 44], sum: 12, type: 'adjacent-total' }, { cells: [24, 25], sum: 12, type: 'adjacent-total' }, { cells: [51, 52], sum: 3, type: 'adjacent-total' },
        { cells: [20, 29], sum: 11, type: 'adjacent-total' }, { cells: [41, 42], sum: 9, type: 'adjacent-total' }, { cells: [15, 16], sum: 8, type: 'adjacent-total' },
        { cells: [43, 44], sum: 14, type: 'adjacent-total' }, { cells: [69, 78], sum: 16, type: 'adjacent-total' }, { cells: [41, 50], sum: 14, type: 'adjacent-total' },
        { cells: [64, 73], sum: 11, type: 'adjacent-total' }, { cells: [75, 76], sum: 9, type: 'adjacent-total' }, { cells: [14, 15], sum: 11, type: 'adjacent-total' },
        { cells: [58, 67], sum: 15, type: 'adjacent-total' }, { cells: [13, 14], sum: 13, type: 'adjacent-total' }, { cells: [37, 38], sum: 15, type: 'adjacent-total' },
        { cells: [38, 47], sum: 13, type: 'adjacent-total' }, { cells: [28, 29], sum: 11, type: 'adjacent-total' }, { cells: [7, 16], sum: 13, type: 'adjacent-total' },
        { cells: [60, 69], sum: 11, type: 'adjacent-total' },
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        { cells: [46, 47], sum: 7, type: 'adjacent-total' }, { cells: [41, 50], sum: 3, type: 'adjacent-total' }, { cells: [3, 12], sum: 9, type: 'adjacent-total' },
        { cells: [35, 44], sum: 14, type: 'adjacent-total' }, { cells: [55, 64], sum: 9, type: 'adjacent-total' }, { cells: [79, 80], sum: 9, type: 'adjacent-total' },
        { cells: [50, 59], sum: 7, type: 'adjacent-total' }, { cells: [5, 6], sum: 11, type: 'adjacent-total' }, { cells: [19, 20], sum: 7, type: 'adjacent-total' },
        { cells: [40, 41], sum: 8, type: 'adjacent-total' }, { cells: [53, 62], sum: 6, type: 'adjacent-total' }, { cells: [0, 9], sum: 14, type: 'adjacent-total' },
        { cells: [59, 68], sum: 9, type: 'adjacent-total' }, { cells: [36, 37], sum: 13, type: 'adjacent-total' }, { cells: [52, 61], sum: 11, type: 'adjacent-total' },
        { cells: [10, 19], sum: 9, type: 'adjacent-total' }, { cells: [8, 17], sum: 16, type: 'adjacent-total' }, { cells: [32, 41], sum: 4, type: 'adjacent-total' },
        { cells: [24, 25], sum: 12, type: 'adjacent-total' }, { cells: [15, 16], sum: 8, type: 'adjacent-total' }, { cells: [66, 67], sum: 4, type: 'adjacent-total' },
        { cells: [6, 7], sum: 6, type: 'adjacent-total' },
      ] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [
        { cells: [64, 73], sum: 11, type: 'adjacent-total' }, { cells: [28, 29], sum: 11, type: 'adjacent-total' }, { cells: [13, 14], sum: 13, type: 'adjacent-total' },
        { cells: [14, 15], sum: 11, type: 'adjacent-total' }, { cells: [38, 47], sum: 13, type: 'adjacent-total' }, { cells: [58, 67], sum: 15, type: 'adjacent-total' },
        { cells: [69, 78], sum: 16, type: 'adjacent-total' }, { cells: [43, 44], sum: 14, type: 'adjacent-total' }, { cells: [24, 25], sum: 12, type: 'adjacent-total' },
        { cells: [75, 76], sum: 9, type: 'adjacent-total' }, { cells: [38, 39], sum: 9, type: 'adjacent-total' }, { cells: [22, 23], sum: 12, type: 'adjacent-total' },
        { cells: [12, 13], sum: 7, type: 'adjacent-total' }, { cells: [15, 16], sum: 8, type: 'adjacent-total' }, { cells: [57, 66], sum: 12, type: 'adjacent-total' },
        { cells: [9, 18], sum: 14, type: 'adjacent-total' }, { cells: [41, 50], sum: 14, type: 'adjacent-total' }, { cells: [7, 16], sum: 13, type: 'adjacent-total' },
        { cells: [37, 38], sum: 15, type: 'adjacent-total' }, { cells: [20, 29], sum: 11, type: 'adjacent-total' }, { cells: [51, 52], sum: 3, type: 'adjacent-total' },
        { cells: [63, 72], sum: 15, type: 'adjacent-total' }, { cells: [35, 44], sum: 12, type: 'adjacent-total' }, { cells: [41, 42], sum: 9, type: 'adjacent-total' },
      ] },
      { givens: EMPTY, rules: [
        { cells: [52, 61], sum: 11, type: 'adjacent-total' }, { cells: [36, 37], sum: 13, type: 'adjacent-total' }, { cells: [40, 41], sum: 8, type: 'adjacent-total' },
        { cells: [50, 59], sum: 7, type: 'adjacent-total' }, { cells: [5, 6], sum: 11, type: 'adjacent-total' }, { cells: [24, 25], sum: 12, type: 'adjacent-total' },
        { cells: [3, 12], sum: 9, type: 'adjacent-total' }, { cells: [6, 7], sum: 6, type: 'adjacent-total' }, { cells: [35, 44], sum: 14, type: 'adjacent-total' },
        { cells: [71, 80], sum: 6, type: 'adjacent-total' }, { cells: [15, 16], sum: 8, type: 'adjacent-total' }, { cells: [66, 67], sum: 4, type: 'adjacent-total' },
        { cells: [46, 47], sum: 7, type: 'adjacent-total' }, { cells: [32, 41], sum: 4, type: 'adjacent-total' }, { cells: [19, 20], sum: 7, type: 'adjacent-total' },
        { cells: [41, 50], sum: 3, type: 'adjacent-total' }, { cells: [8, 17], sum: 16, type: 'adjacent-total' }, { cells: [53, 62], sum: 6, type: 'adjacent-total' },
        { cells: [55, 64], sum: 9, type: 'adjacent-total' }, { cells: [69, 70], sum: 15, type: 'adjacent-total' }, { cells: [79, 80], sum: 9, type: 'adjacent-total' },
        { cells: [63, 72], sum: 9, type: 'adjacent-total' }, { cells: [0, 9], sum: 14, type: 'adjacent-total' }, { cells: [10, 19], sum: 9, type: 'adjacent-total' },
      ] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [
        { cells: [27, 28], sum: 16, type: 'adjacent-total' }, { cells: [73, 74], sum: 17, type: 'adjacent-total' }, { cells: [9, 18], sum: 13, type: 'adjacent-total' },
        { cells: [5, 14], sum: 11, type: 'adjacent-total' }, { cells: [57, 58], sum: 4, type: 'adjacent-total' }, { cells: [39, 40], sum: 11, type: 'adjacent-total' },
        { cells: [59, 60], sum: 15, type: 'adjacent-total' }, { cells: [18, 19], sum: 9, type: 'adjacent-total' }, { cells: [50, 59], sum: 8, type: 'adjacent-total' },
        { cells: [71, 80], sum: 11, type: 'adjacent-total' }, { cells: [1, 2], sum: 13, type: 'adjacent-total' }, { cells: [33, 34], sum: 11, type: 'adjacent-total' },
        { cells: [25, 26], sum: 9, type: 'adjacent-total' }, { cells: [63, 64], sum: 9, type: 'adjacent-total' }, { cells: [28, 37], sum: 8, type: 'adjacent-total' },
        { cells: [32, 33], sum: 8, type: 'adjacent-total' }, { cells: [29, 38], sum: 11, type: 'adjacent-total' }, { cells: [6, 15], sum: 15, type: 'adjacent-total' },
        { cells: [37, 38], sum: 6, type: 'adjacent-total' }, { cells: [11, 12], sum: 7, type: 'adjacent-total' }, { cells: [42, 43], sum: 9, type: 'adjacent-total' },
        { cells: [4, 5], sum: 13, type: 'adjacent-total' }, { cells: [41, 50], sum: 7, type: 'adjacent-total' },
      ] },
      { givens: EMPTY, rules: [
        { cells: [39, 40], sum: 11, type: 'adjacent-total' }, { cells: [49, 50], sum: 8, type: 'adjacent-total' }, { cells: [42, 51], sum: 11, type: 'adjacent-total' },
        { cells: [33, 34], sum: 11, type: 'adjacent-total' }, { cells: [9, 18], sum: 13, type: 'adjacent-total' }, { cells: [1, 2], sum: 13, type: 'adjacent-total' },
        { cells: [50, 59], sum: 8, type: 'adjacent-total' }, { cells: [11, 12], sum: 7, type: 'adjacent-total' }, { cells: [6, 15], sum: 15, type: 'adjacent-total' },
        { cells: [71, 80], sum: 11, type: 'adjacent-total' }, { cells: [5, 14], sum: 11, type: 'adjacent-total' }, { cells: [73, 74], sum: 17, type: 'adjacent-total' },
        { cells: [27, 28], sum: 16, type: 'adjacent-total' }, { cells: [63, 64], sum: 9, type: 'adjacent-total' }, { cells: [40, 49], sum: 15, type: 'adjacent-total' },
        { cells: [4, 5], sum: 13, type: 'adjacent-total' }, { cells: [59, 60], sum: 15, type: 'adjacent-total' }, { cells: [29, 38], sum: 11, type: 'adjacent-total' },
        { cells: [42, 43], sum: 9, type: 'adjacent-total' }, { cells: [32, 33], sum: 8, type: 'adjacent-total' }, { cells: [57, 58], sum: 4, type: 'adjacent-total' },
        { cells: [18, 19], sum: 9, type: 'adjacent-total' }, { cells: [32, 41], sum: 11, type: 'adjacent-total' },
      ] },
    ],
  },
  'anti-knight,arrow': {
    'hard': [
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [13, 23, 33, 41, 51, 61], circle: 4, type: 'arrow' }, { cells: [27, 37, 29, 39], circle: 19, type: 'arrow' },
        { cells: [68, 67, 66, 74], circle: 60, type: 'arrow' }, { cells: [21, 11, 1, 0], circle: 20, type: 'arrow' }, { cells: [7, 15, 24], circle: 17, type: 'arrow' },
        { cells: [62, 71, 80], circle: 70, type: 'arrow' }, { cells: [55, 46], circle: 65, type: 'arrow' },
      ] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [34, 33, 41, 49, 57, 67], circle: 24, type: 'arrow' }, { cells: [5, 13, 12, 11], circle: 15, type: 'arrow' },
        { cells: [28, 37, 45, 55], circle: 27, type: 'arrow' }, { cells: [71, 70, 69], circle: 62, type: 'arrow' }, { cells: [44, 35, 26], circle: 53, type: 'arrow' },
        { cells: [1, 2], circle: 0, type: 'arrow' }, { cells: [47, 48], circle: 46, type: 'arrow' },
      ] },
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [46, 56, 66, 76, 68, 78], circle: 54, type: 'arrow' }, { cells: [41, 33, 25, 35, 43], circle: 50, type: 'arrow' },
        { cells: [21, 11, 1, 9], circle: 29, type: 'arrow' }, { cells: [4, 5, 6], circle: 3, type: 'arrow' }, { cells: [27, 36, 45], circle: 19, type: 'arrow' },
        { cells: [31, 40, 48], circle: 39, type: 'arrow' }, { cells: [14, 15], circle: 13, type: 'arrow' },
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [42, 50, 49, 59, 69, 79], circle: 34, type: 'arrow' }, { cells: [55, 56, 66, 58], circle: 64, type: 'arrow' },
        { cells: [22, 21, 11, 1, 9], circle: 14, type: 'arrow' }, { cells: [7, 17, 25, 35], circle: 8, type: 'arrow' }, { cells: [27, 37, 38], circle: 36, type: 'arrow' },
        { cells: [70, 80], circle: 62, type: 'arrow' }, { cells: [44, 53], circle: 43, type: 'arrow' },
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [49, 50, 59, 58, 66], circle: 48, type: 'arrow' }, { cells: [22, 21, 11, 1, 9], circle: 14, type: 'arrow' },
        { cells: [56, 47, 37, 27], circle: 46, type: 'arrow' }, { cells: [35, 25, 17, 7], circle: 34, type: 'arrow' }, { cells: [24, 33, 42], circle: 23, type: 'arrow' },
        { cells: [79, 69, 78], circle: 71, type: 'arrow' }, { cells: [72, 73], circle: 64, type: 'arrow' },
      ] },
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [69, 70, 60, 50, 42], circle: 68, type: 'arrow' }, { cells: [46, 37, 47, 57, 66], circle: 54, type: 'arrow' },
        { cells: [22, 32, 33, 25], circle: 12, type: 'arrow' }, { cells: [11, 3, 13], circle: 19, type: 'arrow' }, { cells: [43, 35, 44], circle: 52, type: 'arrow' },
        { cells: [7, 16, 17], circle: 6, type: 'arrow' }, { cells: [74, 73, 72], circle: 65, type: 'arrow' },
      ] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [47, 57, 49, 41, 33, 42], circle: 46, type: 'arrow' }, { cells: [13, 12, 20, 28, 18], circle: 4, type: 'arrow' },
        { cells: [75, 65, 73, 63], circle: 74, type: 'arrow' }, { cells: [62, 70, 71], circle: 53, type: 'arrow' }, { cells: [6, 7, 8], circle: 16, type: 'arrow' },
        { cells: [24, 23], circle: 34, type: 'arrow' }, { cells: [52, 61], circle: 51, type: 'arrow' },
      ] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [42, 50, 49, 59, 69, 79], circle: 34, type: 'arrow' }, { cells: [22, 21, 11, 1, 9], circle: 14, type: 'arrow' },
        { cells: [58, 66, 56, 55], circle: 48, type: 'arrow' }, { cells: [7, 17, 25, 35], circle: 8, type: 'arrow' }, { cells: [27, 37, 47], circle: 18, type: 'arrow' },
        { cells: [32, 41], circle: 23, type: 'arrow' }, { cells: [3, 13], circle: 12, type: 'arrow' },
      ] },
      { givens: EMPTY, rules: [
        { type: 'anti-knight' }, { cells: [63, 55, 47, 39, 29, 19], circle: 54, type: 'arrow' }, { cells: [78, 77, 69, 60, 50], circle: 79, type: 'arrow' },
        { cells: [16, 24, 34, 44], circle: 15, type: 'arrow' }, { cells: [23, 13, 4], circle: 22, type: 'arrow' }, { cells: [57, 65, 75], circle: 67, type: 'arrow' },
        { cells: [26, 17, 8], circle: 35, type: 'arrow' }, { cells: [1, 9, 18], circle: 2, type: 'arrow' },
      ] },
    ],
  },
  'arrow,diagonal-main': {
    'impossible': [
      { givens: EMPTY, rules: [
        { diagonal: 'main', type: 'diagonal' }, { cells: [56, 64, 74, 66, 58], circle: 55, type: 'arrow' }, { cells: [33, 34, 24, 16, 8], circle: 43, type: 'arrow' },
        { cells: [50, 40, 39, 47], circle: 59, type: 'arrow' }, { cells: [36, 28, 18, 19], circle: 37, type: 'arrow' }, { cells: [5, 4, 12], circle: 14, type: 'arrow' },
        { cells: [61, 53, 62], circle: 69, type: 'arrow' }, { cells: [71, 80], circle: 79, type: 'arrow' }, { cells: [11, 21], circle: 3, type: 'arrow' },
      ] },
    ],
  },
  'arrow': {
    'hard': [
      { givens: EMPTY, rules: arrows([
        [8, 16, 24, 14, 22, 21], [46, 45, 55, 65, 57, 49, 40], [69, 78, 77, 68, 58], [25, 35, 43, 53], [3, 2, 11, 12], [39, 38, 28],
        [51, 59, 60], [72, 64, 73], [79, 71, 80], [56, 47, 48],
      ]) },
      { givens: EMPTY, rules: arrows([
        [23, 14, 4], [7, 15, 16, 17], [55, 47, 48], [0, 1, 11, 19, 27, 37], [45, 54, 63], [40, 30, 29],
        [68, 67, 75, 65, 64], [24, 33, 42, 52, 60, 59], [12, 22, 31, 41, 50], [79, 71, 61],
      ]) },
      { givens: EMPTY, rules: arrows([
        [18, 19, 29, 39], [27, 36, 46, 56, 65, 73], [8, 7, 6], [55, 63, 72], [21, 13, 5, 15, 24, 34, 44], [52, 62, 71, 80],
        [40, 32, 42, 51, 61], [11, 10, 0, 9], [4, 12, 2], [69, 59, 50], [77, 67, 75, 66],
      ]) },
      { givens: EMPTY, rules: arrows([
        [55, 63, 72], [11, 10, 0, 9], [18, 19, 29, 39], [27, 36, 46, 56, 65, 73], [52, 62, 71, 80], [21, 13, 5, 15, 24, 34, 44],
        [69, 59, 50], [40, 32, 42, 51, 61], [4, 12, 2], [57, 66, 67], [8, 7, 6],
      ]) },
    ],
    'very-hard': [
      { givens: EMPTY, rules: arrows([
        [6, 5, 13, 21, 29, 37], [79, 78, 70, 60, 50, 41], [23, 32, 24, 34, 35], [63, 54, 64, 73], [68, 67, 75, 74], [10, 2, 1, 9],
        [38, 46, 47, 55], [36, 27, 18], [16, 17, 25], [62, 52, 51],
      ]) },
      { givens: EMPTY, rules: arrows([
        [12, 22, 31, 41, 50], [40, 30, 29], [45, 54, 63], [70, 62, 53], [23, 14, 4], [0, 1, 11, 19, 27, 37],
        [68, 67, 75, 65, 64], [7, 6, 16], [35, 26, 25, 17], [24, 33, 42, 52, 60, 59], [39, 48, 49],
      ]) },
    ],
    'expert': [
      { givens: EMPTY, rules: arrows([
        [70, 62, 61, 51, 41, 50], [14, 15, 16, 24, 23, 22], [19, 29, 37, 46, 54], [40, 48, 58, 66, 65], [9, 1, 11, 20], [53, 43, 34, 35],
        [68, 76, 75], [27, 18, 28], [5, 4, 3], [74, 64, 63],
      ]) },
      { givens: EMPTY, rules: arrows([
        [28, 37, 46, 55, 47, 57], [41, 32, 23, 24, 25, 35], [2, 3, 4, 12, 11], [62, 70, 71, 79], [39, 40, 49, 50], [54, 63, 64, 56],
        [67, 66, 75, 76], [52, 44, 34], [10, 1, 9], [5, 14, 15],
      ]) },
    ],
    'master': [
      { givens: EMPTY, rules: arrows([
        [24, 33, 42, 52, 60, 59], [0, 1, 11, 19, 27, 37], [55, 47, 48], [70, 62, 53], [40, 30, 29], [68, 67, 75, 65, 64],
        [7, 15, 16, 17], [12, 22, 31, 41, 50], [23, 14, 4], [73, 63, 72],
      ]) },
      { givens: EMPTY, rules: arrows([
        [37, 38, 46, 47, 48, 40], [32, 23, 33, 25, 15, 5], [71, 79, 69, 77, 67], [66, 56, 55, 64], [10, 0, 9, 18], [20, 21, 12, 2],
        [51, 43, 53, 62], [57, 58, 59], [49, 50, 42], [26, 17, 8],
      ]) },
    ],
    'extreme': [
      { givens: EMPTY, rules: arrows([
        [55, 47, 48], [12, 22, 31, 41, 50], [45, 54, 63], [23, 14, 4], [70, 62, 53], [40, 30, 29],
        [24, 33, 42, 52, 60, 59], [0, 1, 11, 19, 27, 37], [68, 67, 75, 65, 64], [26, 25, 17, 16],
      ]) },
      { givens: EMPTY, rules: arrows([
        [37, 38, 46, 47, 48, 40], [32, 33, 23, 15, 25, 35], [66, 58, 67, 77, 69], [11, 2, 1, 0], [75, 65, 55, 64], [20, 12, 13, 5],
        [51, 43, 53, 62], [26, 17, 8], [10, 18, 27], [49, 50, 42],
      ]) },
    ],
    'impossible': [
      { givens: EMPTY, rules: arrows([
        [0, 1, 11, 19, 27, 37], [7, 6, 16], [40, 30, 29], [68, 67, 75, 65, 64], [23, 14, 4], [55, 47, 48],
        [35, 26, 25, 17], [70, 62, 53], [12, 22, 31, 41, 50], [24, 33, 42, 52, 60, 59], [74, 73, 63],
      ]) },
      { givens: EMPTY, rules: arrows([
        [54, 46, 38, 47, 55, 64], [26, 17, 8], [39, 40, 50], [29, 30, 21], [57, 48, 58, 67, 77], [80, 71, 62],
        [32, 33, 43, 35, 25, 15], [51, 61, 69, 79], [10, 18, 27], [11, 2, 1, 0], [14, 4, 12], [34, 24, 23],
      ]) },
    ],
  },
  'diagonal-main,x-sum': {
    'hard': [
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(76, 'north', 1), xSum(63, 'east', 1), xSum(4, 'south', 44), xSum(7, 'south', 26), xSum(44, 'west', 18), xSum(72, 'east', 27), xSum(18, 'east', 39), xSum(9, 'east', 38), xSum(36, 'east', 19), xSum(71, 'west', 16), xSum(6, 'south', 12), xSum(8, 'west', 30), xSum(0, 'east', 45), xSum(54, 'east', 21), xSum(79, 'north', 10), xSum(78, 'north', 45), xSum(80, 'west', 18), xSum(73, 'north', 36), xSum(53, 'west', 39), xSum(77, 'north', 20), xSum(2, 'south', 5), xSum(8, 'south', 37), xSum(80, 'north', 16), xSum(5, 'south', 33)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(1, 'south', 23), xSum(63, 'east', 1), xSum(17, 'west', 32), xSum(7, 'south', 26), xSum(18, 'east', 39), xSum(35, 'west', 45), xSum(36, 'east', 19), xSum(27, 'east', 10), xSum(4, 'south', 44), xSum(73, 'north', 36), xSum(9, 'east', 38), xSum(62, 'west', 1), xSum(71, 'west', 16), xSum(44, 'west', 18), xSum(8, 'west', 30), xSum(54, 'east', 21), xSum(6, 'south', 12), xSum(79, 'north', 10), xSum(26, 'west', 6), xSum(45, 'east', 30), xSum(74, 'north', 43), xSum(77, 'north', 20), xSum(0, 'south', 45)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(1, 'south', 23), xSum(18, 'east', 39), xSum(72, 'east', 27), xSum(6, 'south', 12), xSum(63, 'east', 1), xSum(73, 'north', 36), xSum(78, 'north', 45), xSum(71, 'west', 16), xSum(27, 'east', 10), xSum(9, 'east', 38), xSum(62, 'west', 1), xSum(79, 'north', 10), xSum(8, 'west', 30), xSum(4, 'south', 44), xSum(0, 'east', 45), xSum(7, 'south', 26), xSum(44, 'west', 18), xSum(17, 'west', 32), xSum(76, 'north', 1), xSum(54, 'east', 21), xSum(80, 'west', 18), xSum(74, 'north', 43), xSum(80, 'north', 16)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(44, 'west', 18), xSum(36, 'east', 19), xSum(6, 'south', 12), xSum(78, 'north', 45), xSum(76, 'north', 1), xSum(4, 'south', 44), xSum(80, 'west', 18), xSum(72, 'east', 27), xSum(1, 'south', 23), xSum(73, 'north', 36), xSum(71, 'west', 16), xSum(63, 'east', 1), xSum(54, 'east', 21), xSum(62, 'west', 1), xSum(79, 'north', 10), xSum(7, 'south', 26), xSum(27, 'east', 10), xSum(35, 'west', 45), xSum(0, 'east', 45), xSum(8, 'west', 30), xSum(18, 'east', 39), xSum(26, 'west', 6), xSum(17, 'west', 32), xSum(9, 'east', 38)] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(35, 'west', 1), xSum(27, 'east', 18), xSum(53, 'west', 25), xSum(5, 'south', 29), xSum(77, 'north', 40), xSum(17, 'west', 18), xSum(9, 'east', 9), xSum(0, 'south', 1), xSum(80, 'north', 10), xSum(8, 'south', 28), xSum(80, 'west', 5), xSum(79, 'north', 8), xSum(7, 'south', 7), xSum(73, 'north', 29), xSum(1, 'south', 24), xSum(4, 'south', 31)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(53, 'west', 25), xSum(8, 'south', 28), xSum(77, 'north', 40), xSum(5, 'south', 29), xSum(80, 'west', 5), xSum(0, 'south', 1), xSum(73, 'north', 29), xSum(35, 'west', 1), xSum(4, 'south', 31), xSum(27, 'east', 18), xSum(17, 'west', 18), xSum(7, 'south', 7), xSum(9, 'east', 9), xSum(75, 'north', 28), xSum(36, 'east', 29)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(8, 'south', 28), xSum(27, 'east', 18), xSum(5, 'south', 29), xSum(53, 'west', 25), xSum(9, 'east', 9), xSum(17, 'west', 18), xSum(35, 'west', 1), xSum(79, 'north', 8), xSum(4, 'south', 31), xSum(0, 'south', 1), xSum(7, 'south', 7), xSum(80, 'north', 10), xSum(73, 'north', 29), xSum(63, 'east', 33), xSum(72, 'east', 18)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(5, 'south', 29), xSum(73, 'north', 29), xSum(9, 'east', 9), xSum(8, 'south', 28), xSum(53, 'west', 25), xSum(0, 'south', 1), xSum(17, 'west', 18), xSum(35, 'west', 1), xSum(27, 'east', 18), xSum(80, 'north', 10), xSum(77, 'north', 40), xSum(80, 'west', 5), xSum(6, 'south', 40), xSum(63, 'east', 33), xSum(3, 'south', 45)] },
    ],
    'expert': [
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(44, 'west', 18), xSum(6, 'south', 12), xSum(76, 'north', 1), xSum(72, 'east', 27), xSum(1, 'south', 23), xSum(71, 'west', 16), xSum(63, 'east', 1), xSum(54, 'east', 21), xSum(62, 'west', 1), xSum(7, 'south', 26), xSum(27, 'east', 10), xSum(35, 'west', 45), xSum(8, 'west', 30), xSum(18, 'east', 39), xSum(17, 'west', 32), xSum(9, 'east', 38)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(76, 'north', 1), xSum(6, 'south', 12), xSum(27, 'east', 10), xSum(18, 'east', 39), xSum(1, 'south', 23), xSum(54, 'east', 21), xSum(71, 'west', 16), xSum(44, 'west', 18), xSum(7, 'south', 26), xSum(9, 'east', 38), xSum(17, 'west', 32), xSum(35, 'west', 45), xSum(2, 'south', 5), xSum(53, 'west', 39), xSum(0, 'south', 45)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(17, 'west', 32), xSum(7, 'south', 26), xSum(54, 'east', 21), xSum(44, 'west', 18), xSum(6, 'south', 12), xSum(18, 'east', 39), xSum(8, 'west', 30), xSum(63, 'east', 1), xSum(9, 'east', 38), xSum(76, 'north', 1), xSum(1, 'south', 23), xSum(72, 'east', 27), xSum(27, 'east', 10), xSum(79, 'north', 10), xSum(77, 'north', 20), xSum(53, 'west', 39), xSum(0, 'east', 45)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(9, 'east', 38), xSum(62, 'west', 1), xSum(7, 'south', 26), xSum(8, 'west', 30), xSum(76, 'north', 1), xSum(44, 'west', 18), xSum(35, 'west', 45), xSum(72, 'east', 27), xSum(1, 'south', 23), xSum(54, 'east', 21), xSum(18, 'east', 39), xSum(71, 'west', 16), xSum(27, 'east', 10), xSum(0, 'east', 45), xSum(4, 'south', 44), xSum(78, 'north', 45), xSum(75, 'north', 33)] },
    ],
    'master': [
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(76, 'north', 1), xSum(4, 'south', 38), xSum(35, 'west', 16), xSum(6, 'south', 25), xSum(72, 'north', 40), xSum(8, 'south', 34), xSum(9, 'east', 23), xSum(45, 'east', 38), xSum(27, 'east', 29), xSum(77, 'north', 28), xSum(53, 'west', 1), xSum(1, 'south', 16), xSum(72, 'east', 43), xSum(8, 'west', 28)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(1, 'south', 16), xSum(72, 'north', 40), xSum(36, 'east', 45), xSum(9, 'east', 23), xSum(45, 'east', 38), xSum(53, 'west', 1), xSum(77, 'north', 28), xSum(78, 'north', 29), xSum(6, 'south', 25), xSum(27, 'east', 29), xSum(35, 'west', 16), xSum(76, 'north', 1), xSum(4, 'south', 38), xSum(8, 'south', 34), xSum(80, 'north', 7)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(45, 'east', 38), xSum(78, 'north', 29), xSum(53, 'west', 1), xSum(1, 'south', 16), xSum(80, 'north', 7), xSum(9, 'east', 23), xSum(76, 'north', 1), xSum(77, 'north', 28), xSum(8, 'south', 34), xSum(6, 'south', 25), xSum(62, 'west', 23), xSum(5, 'south', 40), xSum(75, 'north', 14), xSum(54, 'east', 1), xSum(63, 'east', 12), xSum(17, 'west', 45)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(76, 'north', 1), xSum(36, 'east', 45), xSum(1, 'south', 16), xSum(53, 'west', 1), xSum(27, 'east', 29), xSum(9, 'east', 23), xSum(45, 'east', 38), xSum(4, 'south', 38), xSum(77, 'north', 28), xSum(72, 'east', 43), xSum(62, 'west', 23), xSum(0, 'south', 26), xSum(79, 'north', 42), xSum(26, 'west', 43), xSum(18, 'east', 9)] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(27, 'east', 33), xSum(72, 'east', 31), xSum(35, 'west', 38), xSum(6, 'south', 14), xSum(4, 'south', 45), xSum(9, 'east', 25), xSum(2, 'south', 20), xSum(17, 'west', 45), xSum(79, 'north', 17), xSum(62, 'west', 7), xSum(75, 'north', 43), xSum(73, 'north', 45), xSum(71, 'west', 32), xSum(7, 'south', 33), xSum(45, 'east', 32)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(9, 'east', 25), xSum(17, 'west', 45), xSum(27, 'east', 33), xSum(35, 'west', 38), xSum(4, 'south', 45), xSum(76, 'north', 7), xSum(44, 'west', 1), xSum(79, 'north', 17), xSum(62, 'west', 7), xSum(75, 'north', 43), xSum(2, 'south', 20), xSum(71, 'west', 32), xSum(6, 'south', 14), xSum(78, 'north', 1), xSum(72, 'east', 31), xSum(73, 'north', 45)] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(44, 'west', 18), xSum(6, 'south', 12), xSum(76, 'north', 1), xSum(72, 'east', 27), xSum(71, 'west', 16), xSum(63, 'east', 1), xSum(54, 'east', 21), xSum(62, 'west', 1), xSum(7, 'south', 26), xSum(27, 'east', 10), xSum(35, 'west', 45), xSum(8, 'west', 30), xSum(18, 'east', 39), xSum(17, 'west', 32), xSum(9, 'east', 38)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(44, 'west', 18), xSum(7, 'south', 26), xSum(35, 'west', 45), xSum(17, 'west', 32), xSum(27, 'east', 10), xSum(9, 'east', 38), xSum(8, 'west', 30), xSum(6, 'south', 12), xSum(72, 'east', 27), xSum(62, 'west', 1), xSum(36, 'east', 19), xSum(26, 'west', 6), xSum(1, 'south', 23), xSum(77, 'north', 20)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(27, 'east', 10), xSum(76, 'north', 1), xSum(8, 'west', 30), xSum(63, 'east', 1), xSum(62, 'west', 1), xSum(44, 'west', 18), xSum(6, 'south', 12), xSum(72, 'east', 27), xSum(7, 'south', 26), xSum(9, 'east', 38), xSum(5, 'south', 33), xSum(73, 'north', 36), xSum(78, 'north', 45), xSum(26, 'west', 6), xSum(45, 'east', 30)] },
      { givens: EMPTY, rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(6, 'south', 12), xSum(54, 'east', 21), xSum(17, 'west', 32), xSum(8, 'west', 30), xSum(63, 'east', 1), xSum(72, 'east', 27), xSum(62, 'west', 1), xSum(18, 'east', 39), xSum(27, 'east', 10), xSum(2, 'south', 5), xSum(74, 'north', 43), xSum(75, 'north', 33), xSum(5, 'south', 33), xSum(8, 'south', 37), xSum(36, 'east', 19), xSum(73, 'north', 36)] },
    ],
  },
  'inequality': {
    'hard': [
      { givens: EMPTY, rules: inequalities([
        [52, 53], [70, 71], [44, 43], [67, 68], [67, 76], [23, 14], [56, 47], [80, 71], [16, 17],
        [78, 79], [40, 31], [6, 15], [12, 13], [63, 72], [38, 47], [34, 25], [31, 30], [45, 54],
        [29, 30], [57, 48], [26, 17], [14, 15], [17, 8], [70, 79], [39, 40], [42, 43], [38, 37],
        [26, 35], [33, 32], [10, 9], [53, 62], [55, 64], [5, 14], [32, 31], [68, 59], [36, 37],
        [52, 43], [73, 72], [61, 62], [57, 58], [39, 30], [10, 19], [49, 48], [74, 73], [10, 1],
        [60, 69], [0, 9], [41, 32], [3, 12], [2, 11], [13, 22], [75, 66], [32, 23], [33, 24],
        [36, 45], [40, 41], [24, 15], [21, 22], [13, 14], [50, 51], [26, 25], [52, 61], [60, 61],
        [27, 28], [74, 75], [62, 71], [50, 49], [69, 70], [19, 18], [67, 58], [64, 65], [41, 42],
        [31, 22], [45, 46], [16, 7], [20, 29], [55, 54], [16, 25], [46, 37], [10, 11], [74, 65],
        [55, 46], [16, 15], [34, 33], [44, 53], [42, 51], [55, 56], [27, 18], [39, 38], [9, 18],
        [24, 25], [48, 47], [77, 78], [2, 1], [34, 35], [44, 35], [0, 1], [20, 21], [4, 13],
        [65, 56], [68, 77], [20, 11], [7, 6], [23, 22], [57, 66], [36, 27], [69, 78], [19, 28],
        [33, 42], [29, 28], [80, 79], [61, 70], [7, 8],
      ]) },
      { givens: EMPTY, rules: inequalities([
        [17, 16], [18, 9], [52, 61], [55, 46], [33, 24], [48, 49], [32, 33], [29, 20], [22, 21],
        [75, 66], [79, 70], [21, 20], [48, 47], [17, 26], [65, 64], [22, 31], [33, 34], [44, 43],
        [33, 42], [79, 80], [11, 20], [13, 14], [49, 40], [4, 5], [23, 14], [3, 4], [61, 60],
        [73, 64], [30, 21], [6, 5], [50, 59], [51, 50], [37, 36], [58, 49], [23, 24], [44, 35],
        [13, 12], [55, 64], [38, 47], [3, 2], [2, 1], [39, 40], [68, 77], [40, 31], [32, 23],
        [22, 13], [7, 6], [50, 49], [73, 74], [15, 14], [48, 57], [10, 1], [76, 75], [3, 12],
        [79, 78], [70, 61], [0, 1], [68, 59], [37, 28], [28, 27], [34, 25], [71, 70], [67, 66],
        [19, 20], [41, 42], [53, 44], [34, 43], [7, 8], [2, 11], [45, 46], [51, 42], [30, 39],
        [58, 59], [15, 24], [41, 40], [16, 15], [67, 58], [74, 75], [69, 78], [63, 72], [62, 61],
        [19, 28], [57, 58], [62, 53], [30, 31], [71, 80], [54, 55], [73, 72], [67, 68], [69, 60],
        [32, 41], [16, 7], [17, 8], [37, 46], [47, 46], [59, 60], [13, 4], [63, 64], [22, 23],
        [32, 31], [54, 45], [36, 27], [26, 35], [12, 11], [28, 29], [57, 66], [6, 15], [9, 0],
        [52, 43], [77, 78], [56, 57], [26, 25], [21, 12], [51, 60],
      ]) },
    ],
    'very-hard': [
      { givens: EMPTY, rules: inequalities([
        [9, 0], [1, 2], [11, 2], [4, 3], [4, 5], [6, 5], [14, 5], [6, 15], [7, 16],
        [17, 8], [10, 9], [11, 10], [11, 12], [11, 20], [13, 12], [12, 21], [13, 22], [14, 15],
        [14, 23], [24, 15], [17, 16], [25, 16], [26, 17], [28, 19], [20, 21], [22, 21], [21, 30],
        [31, 22], [24, 33], [26, 25], [34, 25], [26, 35], [28, 27], [27, 36], [28, 29], [28, 37],
        [29, 30], [38, 29], [31, 30], [39, 30], [31, 32], [40, 31], [32, 41], [34, 33], [42, 33],
        [35, 34], [43, 34], [45, 36], [39, 38], [38, 47], [39, 40], [40, 49], [43, 42], [44, 43],
        [43, 52], [44, 53], [46, 45], [45, 54], [56, 47], [48, 49], [50, 49], [49, 58], [50, 51],
        [50, 59], [51, 52], [60, 51], [53, 52], [61, 52], [53, 62], [55, 54], [63, 54], [55, 56],
        [56, 57], [56, 65], [57, 58], [66, 57], [59, 58], [67, 58], [60, 59], [68, 59], [60, 61],
        [60, 69], [61, 62], [61, 70], [71, 62], [63, 64], [72, 63], [65, 64], [73, 64], [66, 65],
        [67, 66], [66, 75], [67, 68], [67, 76], [68, 69], [69, 70], [78, 69], [70, 71], [79, 70],
        [80, 71], [72, 73], [74, 75], [75, 76], [77, 76], [78, 77], [78, 79], [79, 80],
      ]) },
      { givens: EMPTY, rules: inequalities([
        [9, 0], [2, 1], [10, 1], [3, 2], [2, 11], [3, 4], [3, 12], [4, 5], [13, 4],
        [5, 6], [7, 6], [15, 6], [8, 7], [7, 16], [8, 17], [10, 9], [10, 11], [10, 19],
        [11, 12], [20, 11], [13, 12], [21, 12], [14, 13], [13, 22], [14, 15], [15, 16], [15, 24],
        [17, 16], [16, 25], [26, 17], [19, 18], [27, 18], [20, 19], [19, 28], [20, 29], [21, 22],
        [21, 30], [23, 22], [23, 24], [23, 32], [24, 25], [24, 33], [26, 25], [34, 25], [26, 35],
        [27, 28], [37, 28], [29, 30], [38, 29], [31, 30], [31, 32], [32, 33], [32, 41], [34, 33],
        [33, 42], [34, 35], [34, 43], [37, 36], [45, 36], [46, 37], [38, 47], [39, 40], [39, 48],
        [41, 42], [43, 42], [42, 51], [43, 44], [52, 43], [46, 45], [54, 45], [46, 47], [46, 55],
        [47, 56], [48, 49], [48, 57], [58, 49], [50, 51], [59, 50], [52, 51], [60, 51], [52, 53],
        [52, 61], [53, 62], [54, 63], [55, 64], [57, 56], [65, 56], [58, 57], [66, 57], [67, 58],
        [60, 59], [59, 68], [60, 61], [61, 62], [61, 70], [71, 62], [63, 64], [72, 63], [65, 64],
        [73, 64], [65, 66], [65, 74], [67, 66], [66, 75], [67, 68], [67, 76], [69, 68], [77, 68],
        [69, 70], [70, 79], [73, 72], [74, 73], [74, 75], [75, 76], [78, 77], [78, 79],
      ]) },
    ],
    'expert': [
      { givens: EMPTY, rules: inequalities([
        [9, 0], [2, 1], [10, 1], [3, 2], [2, 11], [3, 4], [3, 12], [4, 5], [13, 4],
        [5, 6], [7, 6], [15, 6], [8, 7], [7, 16], [8, 17], [10, 9], [10, 11], [10, 19],
        [11, 12], [20, 11], [13, 12], [21, 12], [14, 13], [13, 22], [15, 16], [15, 24], [17, 16],
        [16, 25], [26, 17], [19, 18], [27, 18], [20, 19], [20, 29], [21, 22], [21, 30], [23, 22],
        [23, 24], [23, 32], [24, 25], [24, 33], [26, 25], [34, 25], [26, 35], [27, 28], [37, 28],
        [29, 30], [38, 29], [31, 30], [31, 32], [32, 33], [32, 41], [34, 33], [33, 42], [34, 35],
        [34, 43], [37, 36], [45, 36], [46, 37], [38, 47], [39, 40], [39, 48], [41, 42], [43, 42],
        [42, 51], [43, 44], [52, 43], [46, 45], [54, 45], [46, 47], [46, 55], [47, 56], [48, 49],
        [48, 57], [58, 49], [50, 51], [59, 50], [52, 51], [60, 51], [52, 53], [52, 61], [53, 62],
        [55, 64], [57, 56], [65, 56], [58, 57], [67, 58], [59, 68], [60, 61], [61, 62], [71, 62],
        [63, 64], [72, 63], [65, 64], [73, 64], [65, 74], [67, 66], [66, 75], [67, 68], [67, 76],
        [69, 68], [77, 68], [69, 70], [70, 79], [73, 72], [74, 73], [74, 75], [75, 76], [78, 77],
        [78, 79],
      ]) },
      { givens: EMPTY, rules: inequalities([
        [0, 1], [0, 9], [2, 1], [10, 1], [2, 11], [3, 12], [4, 13], [5, 14], [7, 6],
        [6, 15], [16, 7], [17, 8], [10, 9], [9, 18], [10, 11], [10, 19], [20, 11], [12, 13],
        [13, 14], [13, 22], [14, 15], [23, 14], [16, 15], [24, 15], [16, 17], [16, 25], [26, 17],
        [19, 18], [27, 18], [19, 28], [20, 21], [20, 29], [21, 22], [23, 22], [31, 22], [32, 23],
        [24, 25], [33, 24], [26, 25], [34, 25], [26, 35], [27, 28], [36, 27], [29, 28], [29, 30],
        [31, 30], [39, 30], [32, 31], [40, 31], [33, 32], [41, 32], [34, 33], [33, 42], [34, 35],
        [44, 35], [36, 37], [36, 45], [38, 37], [46, 37], [39, 38], [38, 47], [39, 40], [40, 41],
        [41, 42], [42, 43], [42, 51], [44, 43], [52, 43], [44, 53], [45, 46], [45, 54], [55, 46],
        [48, 47], [56, 47], [49, 48], [57, 48], [50, 49], [50, 51], [52, 51], [52, 53], [52, 61],
        [53, 62], [55, 54], [55, 56], [55, 64], [65, 56], [57, 58], [57, 66], [67, 58], [68, 59],
        [60, 61], [60, 69], [61, 62], [62, 71], [63, 72], [64, 65], [74, 65], [75, 66], [67, 68],
        [67, 76], [68, 77], [69, 70], [69, 78], [70, 71], [70, 79], [80, 71], [73, 72], [74, 73],
        [74, 75], [77, 78], [78, 79], [80, 79],
      ]) },
    ],
    'master': [
      { givens: EMPTY, rules: inequalities([
        [0, 1], [2, 1], [2, 11], [4, 13], [5, 14], [7, 6], [6, 15], [16, 7], [17, 8],
        [10, 9], [9, 18], [10, 11], [20, 11], [12, 13], [13, 14], [14, 15], [23, 14], [16, 15],
        [24, 15], [16, 17], [16, 25], [26, 17], [19, 18], [19, 28], [20, 29], [21, 22], [23, 22],
        [32, 23], [24, 25], [33, 24], [34, 25], [26, 35], [27, 28], [36, 27], [29, 30], [40, 31],
        [41, 32], [34, 33], [34, 35], [44, 35], [36, 37], [36, 45], [38, 37], [46, 37], [39, 38],
        [38, 47], [39, 40], [40, 41], [42, 43], [42, 51], [44, 43], [52, 43], [44, 53], [45, 46],
        [45, 54], [55, 46], [48, 47], [56, 47], [49, 48], [57, 48], [50, 49], [50, 51], [52, 51],
        [52, 53], [52, 61], [53, 62], [55, 54], [55, 56], [55, 64], [65, 56], [57, 58], [57, 66],
        [67, 58], [68, 59], [60, 61], [60, 69], [61, 62], [62, 71], [63, 72], [64, 65], [74, 65],
        [75, 66], [67, 68], [67, 76], [68, 77], [69, 70], [70, 71], [70, 79], [80, 71], [73, 72],
        [74, 73], [77, 78], [78, 79], [80, 79],
      ]) },
      { givens: EMPTY, rules: inequalities([
        [0, 1], [9, 0], [3, 2], [2, 11], [3, 12], [13, 4], [6, 5], [14, 5], [6, 7],
        [6, 15], [16, 7], [8, 17], [9, 18], [10, 11], [20, 11], [13, 12], [21, 12], [13, 14],
        [15, 16], [16, 25], [26, 17], [18, 19], [18, 27], [19, 20], [28, 19], [21, 20], [29, 20],
        [22, 21], [31, 22], [24, 23], [23, 32], [24, 25], [24, 33], [26, 25], [34, 25], [26, 35],
        [28, 27], [36, 27], [28, 37], [29, 30], [38, 29], [31, 30], [31, 40], [32, 33], [41, 32],
        [34, 33], [42, 33], [35, 34], [43, 34], [35, 44], [36, 45], [38, 37], [46, 37], [39, 38],
        [38, 47], [39, 40], [39, 48], [41, 40], [41, 42], [41, 50], [43, 42], [51, 42], [43, 44],
        [52, 43], [45, 54], [46, 47], [56, 47], [57, 48], [50, 49], [58, 49], [50, 51], [52, 53],
        [52, 61], [53, 62], [55, 54], [63, 54], [55, 64], [56, 57], [56, 65], [57, 58], [57, 66],
        [58, 67], [59, 60], [61, 60], [69, 60], [61, 62], [61, 70], [72, 63], [65, 64], [73, 64],
        [65, 66], [65, 74], [66, 67], [75, 66], [68, 67], [76, 67], [68, 77], [78, 69], [70, 79],
        [71, 80], [73, 72], [74, 73], [75, 74], [75, 76], [77, 76], [78, 77], [79, 80],
      ]) },
    ],
    'extreme': [
      { givens: EMPTY, rules: inequalities([
        [1, 0], [1, 2], [10, 1], [2, 3], [2, 11], [3, 4], [12, 3], [5, 4], [13, 4],
        [6, 5], [14, 5], [6, 7], [6, 15], [7, 8], [7, 16], [8, 17], [10, 9], [9, 18],
        [10, 11], [10, 19], [12, 11], [20, 11], [13, 12], [21, 12], [13, 14], [14, 15], [23, 14],
        [16, 15], [24, 15], [16, 25], [26, 17], [19, 18], [18, 27], [20, 19], [28, 19], [21, 20],
        [29, 20], [21, 22], [21, 30], [23, 22], [22, 31], [23, 24], [24, 25], [24, 33], [34, 25],
        [35, 26], [28, 27], [36, 27], [29, 28], [37, 28], [29, 30], [29, 38], [30, 31], [39, 30],
        [32, 31], [40, 31], [32, 33], [32, 41], [34, 33], [42, 33], [35, 34], [43, 34], [35, 44],
        [37, 36], [45, 36], [37, 38], [46, 37], [39, 38], [47, 38], [48, 39], [40, 41], [40, 49],
        [42, 41], [50, 41], [43, 42], [42, 51], [43, 44], [43, 52], [44, 53], [46, 45], [54, 45],
        [47, 46], [46, 55], [47, 48], [47, 56], [48, 49], [48, 57], [50, 49], [58, 49], [50, 51],
        [51, 52], [51, 60], [52, 53], [61, 52], [62, 53], [55, 56], [55, 64], [56, 57], [65, 56],
        [58, 57], [66, 57], [59, 58], [58, 67], [59, 60], [59, 68], [61, 60], [69, 60], [62, 61],
        [61, 70], [71, 62], [63, 64], [63, 72], [65, 64], [73, 64], [66, 65], [74, 65], [66, 67],
        [66, 75], [67, 68], [76, 67], [69, 68], [77, 68], [69, 70], [78, 69], [71, 70], [71, 80],
        [72, 73], [74, 73], [74, 75], [76, 75], [76, 77], [78, 77], [79, 78], [79, 80],
      ]) },
    ],
  },
  'killer-cages': {
    'hard': [
      { givens: EMPTY, rules: [killer([[18, 0, 9, 18, 27], [19, 1, 10, 11], [5, 4, 13], [19, 5, 6, 7], [8, 8, 16, 17], [10, 14, 15], [5, 19, 28], [21, 22, 30, 31], [13, 32, 41], [12, 33, 42, 51], [11, 35, 44], [11, 36, 37], [13, 45, 54], [19, 46, 47, 48], [4, 50, 59], [15, 55, 56], [18, 60, 61, 69, 62], [5, 65, 74], [18, 70, 71, 80], [17, 68, 77, 78, 79], [22, 34, 43, 52, 53], [20, 2, 3, 12, 21], [13, 20, 29, 38, 39], [26, 66, 75, 67, 76], [18, 40, 49, 57, 58], [17, 63, 72, 64, 73], [28, 23, 24, 25, 26]])] },
      { givens: EMPTY, rules: [killer([[14, 3, 4], [4, 12, 13], [9, 21, 22], [7, 23, 32], [11, 24, 33], [9, 27, 28], [15, 29, 30, 31], [11, 36, 37], [6, 42, 51], [9, 50, 59], [11, 52, 53], [17, 54, 55, 64], [9, 63, 72], [7, 66, 75], [7, 67, 68], [11, 73, 74], [15, 76, 77], [23, 69, 70, 78, 79], [20, 45, 46, 38, 47], [25, 39, 40, 41, 48, 49], [23, 56, 65, 57, 58], [22, 60, 61, 62, 71, 80], [24, 7, 16, 25, 8, 17], [27, 10, 19, 11, 20], [30, 34, 43, 26, 35, 44], [21, 5, 14, 6, 15], [18, 0, 9, 18, 1, 2]])] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [killer([[14, 3, 4, 5], [14, 7, 8], [7, 9, 18], [4, 11, 12], [12, 20, 21], [5, 27, 28], [11, 29, 30], [5, 31, 32], [13, 36, 45], [16, 38, 39], [13, 40, 41], [17, 54, 63], [9, 55, 56, 57], [10, 64, 72, 73], [23, 77, 78, 79, 80], [24, 13, 14, 22, 23], [16, 59, 60, 69], [19, 33, 34, 42, 43], [22, 49, 58, 67, 68, 76], [14, 6, 15, 16, 17], [23, 65, 66, 74, 75], [16, 61, 62, 70, 71], [22, 37, 46, 47, 48], [29, 24, 25, 26, 35, 44], [18, 50, 51, 52, 53], [29, 0, 1, 2, 10, 19]])] },
      { givens: EMPTY, rules: [killer([[16, 0, 1, 2], [14, 3, 4, 5], [14, 7, 8], [7, 9, 18], [13, 10, 19], [4, 11, 12], [12, 20, 21], [5, 27, 28], [11, 29, 30], [5, 31, 32], [13, 36, 45], [16, 38, 39], [13, 40, 41], [17, 54, 63], [9, 55, 56, 57], [10, 64, 72, 73], [23, 77, 78, 79, 80], [24, 13, 14, 22, 23], [16, 59, 60, 69], [19, 33, 34, 42, 43], [22, 49, 58, 67, 68, 76], [14, 6, 15, 16, 17], [23, 65, 66, 74, 75], [16, 61, 62, 70, 71], [22, 37, 46, 47, 48], [29, 24, 25, 26, 35, 44], [18, 50, 51, 52, 53]])] },
      { givens: EMPTY, rules: [killer([[9, 0, 9], [14, 1, 2], [12, 3, 12], [14, 6, 7, 15], [10, 8, 17], [14, 10, 11], [4, 18, 27], [5, 19, 28], [22, 21, 22, 30, 31], [15, 23, 24], [7, 42, 51], [12, 49, 50], [15, 54, 63], [3, 59, 68], [20, 16, 25, 26, 35], [24, 57, 58, 66, 67], [21, 64, 65, 72, 73], [21, 39, 48, 40, 41], [21, 20, 29, 36, 37, 38], [28, 69, 70, 71, 79, 80], [12, 4, 13, 5, 14], [21, 52, 53, 60, 61, 62], [30, 32, 33, 34, 43, 44], [21, 74, 75, 76, 77, 78], [30, 45, 46, 47, 55, 56]])] },
    ],
    'expert': [
      { givens: EMPTY, rules: [killer([[15, 0, 9], [11, 1, 2], [5, 3, 4], [20, 5, 14, 23], [10, 6, 15], [10, 7, 8], [7, 16, 25], [11, 17, 26], [12, 18, 19], [6, 20, 21], [6, 27, 36], [4, 28, 29], [16, 30, 31, 40], [3, 32, 41], [13, 37, 46], [17, 38, 39], [8, 45, 54], [17, 48, 49, 50], [5, 52, 53], [13, 55, 64], [7, 63, 72], [14, 65, 66, 75], [10, 67, 68], [15, 73, 74], [14, 76, 77], [23, 69, 78, 60, 61, 70], [21, 10, 11, 12, 13, 22], [23, 24, 33, 42, 51], [22, 62, 71, 79, 80], [23, 47, 56, 57, 58, 59], [24, 34, 35, 43, 44]])] },
      { givens: EMPTY, rules: [killer([[15, 0, 9], [11, 1, 2], [5, 3, 4], [20, 5, 14, 23], [10, 6, 15], [10, 7, 8], [7, 16, 25], [11, 17, 26], [12, 18, 19], [6, 20, 21], [6, 27, 36], [4, 28, 29], [16, 30, 31, 40], [3, 32, 41], [13, 37, 46], [17, 38, 39], [8, 45, 54], [17, 48, 49, 50], [5, 52, 53], [7, 63, 72], [14, 65, 66, 75], [10, 67, 68], [14, 76, 77], [23, 69, 78, 60, 61, 70], [21, 10, 11, 12, 13, 22], [23, 24, 33, 42, 51], [22, 62, 71, 79, 80], [23, 47, 56, 57, 58, 59], [24, 34, 35, 43, 44], [28, 55, 64, 73, 74]])] },
      { givens: EMPTY, rules: [killer([[14, 0, 9], [3, 5, 6], [18, 7, 16, 8, 17], [29, 12, 21, 22, 23, 24], [15, 18, 27, 28, 37], [3, 19, 20], [13, 25, 26, 35], [4, 29, 38], [31, 30, 31, 32, 33, 34], [11, 39, 40, 48], [28, 41, 42, 50, 43], [6, 44, 53], [29, 46, 47, 55, 64, 56], [9, 51, 52], [16, 57, 66], [13, 60, 61, 62], [16, 71, 80], [12, 75, 76, 77], [16, 69, 70, 78, 79], [21, 49, 58, 67, 59, 68], [25, 1, 10, 2, 11], [22, 36, 45, 54, 63], [23, 72, 73, 65, 74], [28, 3, 4, 13, 14, 15]])] },
    ],
    'master': [
      { givens: EMPTY, rules: [killer([[14, 3, 4, 5], [14, 7, 8], [7, 9, 18], [4, 11, 12], [12, 20, 21], [5, 27, 28], [11, 29, 30], [5, 31, 32], [13, 36, 45], [16, 38, 39], [13, 40, 41], [17, 54, 63], [9, 55, 56, 57], [10, 72, 64, 73], [23, 77, 78, 79, 80], [24, 13, 14, 22, 23], [22, 59, 60, 68, 69], [19, 33, 42, 34, 43], [16, 49, 58, 67, 76], [14, 6, 15, 16, 17], [23, 65, 66, 74, 75], [16, 61, 70, 62, 71], [22, 37, 46, 47, 48], [29, 24, 25, 26, 35, 44], [18, 50, 51, 52, 53], [29, 0, 1, 2, 10, 19]])] },
      { givens: EMPTY, rules: [killer([[16, 0, 1, 2], [14, 3, 4, 5], [14, 7, 8], [7, 9, 18], [13, 10, 19], [4, 11, 12], [12, 20, 21], [5, 27, 28], [11, 29, 30], [5, 31, 32], [13, 36, 45], [16, 38, 39], [13, 40, 41], [17, 54, 63], [9, 55, 56, 57], [10, 72, 64, 73], [23, 77, 78, 79, 80], [24, 13, 14, 22, 23], [22, 59, 60, 68, 69], [19, 33, 42, 34, 43], [16, 49, 58, 67, 76], [14, 6, 15, 16, 17], [23, 65, 66, 74, 75], [16, 61, 70, 62, 71], [22, 37, 46, 47, 48], [29, 24, 25, 26, 35, 44], [18, 50, 51, 52, 53]])] },
      { givens: EMPTY, rules: [killer([[19, 0, 9, 1], [9, 7, 8], [5, 10, 19], [8, 14, 15], [18, 18, 27, 36], [11, 21, 22], [6, 23, 24], [11, 28, 29, 30], [3, 31, 40], [9, 37, 46], [13, 45, 54, 55], [17, 49, 50], [18, 56, 65, 66], [15, 58, 67], [5, 59, 68], [14, 60, 61], [5, 63, 64], [16, 69, 70, 79], [14, 72, 73], [12, 74, 75], [16, 76, 77, 78], [31, 34, 43, 52, 35, 44], [26, 16, 25, 17, 26], [25, 2, 3, 4, 5, 6], [24, 32, 33, 41, 42, 51], [26, 38, 39, 47, 48, 57], [19, 11, 20, 12, 13], [10, 53, 62, 71, 80]])] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [killer([[15, 0, 9], [11, 1, 2], [5, 3, 4], [20, 5, 14, 23], [10, 6, 15], [10, 7, 8], [7, 16, 25], [11, 17, 26], [12, 18, 19], [6, 20, 21], [6, 27, 36], [4, 28, 29], [13, 37, 46], [17, 38, 39], [8, 45, 54], [17, 48, 49, 50], [5, 52, 53], [7, 63, 72], [14, 65, 66, 75], [10, 67, 68], [14, 76, 77], [23, 69, 78, 60, 61, 70], [21, 10, 11, 12, 13, 22], [23, 24, 33, 42, 51], [22, 62, 71, 79, 80], [23, 47, 56, 57, 58, 59], [24, 34, 35, 43, 44], [28, 55, 64, 73, 74], [19, 30, 31, 40, 32, 41]])] },
      { givens: EMPTY, rules: [killer([[15, 0, 9], [11, 1, 2], [5, 3, 4], [20, 5, 14, 23], [10, 6, 15], [10, 7, 8], [7, 16, 25], [11, 17, 26], [12, 18, 19], [6, 20, 21], [13, 37, 46], [17, 38, 39], [8, 45, 54], [17, 48, 49, 50], [5, 52, 53], [7, 63, 72], [14, 65, 66, 75], [10, 67, 68], [14, 76, 77], [23, 69, 78, 60, 61, 70], [21, 10, 11, 12, 13, 22], [23, 24, 33, 42, 51], [22, 62, 71, 79, 80], [23, 47, 56, 57, 58, 59], [24, 34, 35, 43, 44], [28, 55, 64, 73, 74], [19, 30, 31, 40, 32, 41], [10, 27, 36, 28, 29]])] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [killer([[7, 0, 1], [11, 6, 7], [11, 8, 17], [8, 9, 10], [16, 13, 14], [14, 30, 31], [10, 33, 34], [8, 47, 48], [8, 59, 68], [18, 66, 67, 76, 77], [23, 15, 24, 16, 25, 26], [12, 11, 12, 21, 22], [27, 28, 37, 29, 38, 39], [19, 23, 32, 41, 50], [21, 46, 55, 56, 65], [20, 40, 49, 57, 58], [27, 42, 43, 51, 60], [16, 35, 44, 52, 53], [26, 18, 27, 19, 20], [25, 64, 73, 74, 75], [22, 2, 3, 4, 5], [17, 69, 70, 78, 79], [20, 61, 62, 71, 80], [19, 36, 45, 54, 63, 72]])] },
      { givens: EMPTY, rules: [killer([[12, 0, 9], [10, 1, 10], [6, 6, 15], [15, 7, 8], [10, 17, 26], [16, 18, 27, 36], [14, 24, 16, 25], [12, 38, 47], [15, 39, 40], [10, 41, 33, 42], [8, 44, 53], [10, 45, 54, 63], [8, 48, 57], [11, 61, 62], [13, 72, 73], [8, 74, 75, 76], [30, 68, 69, 77, 78], [27, 49, 50, 59, 51, 60], [13, 70, 71, 79, 80], [18, 37, 46, 55, 64, 56], [11, 2, 3, 11, 12], [27, 19, 28, 20, 29], [24, 65, 66, 58, 67], [23, 34, 35, 43, 52], [29, 4, 13, 5, 14, 23], [25, 21, 30, 22, 31, 32]])] },
      { givens: EMPTY, rules: [killer([[12, 0, 9], [10, 1, 10], [10, 17, 26], [16, 18, 27, 36], [14, 24, 16, 25], [12, 38, 47], [15, 39, 40], [10, 41, 33, 42], [8, 44, 53], [10, 45, 54, 63], [8, 48, 57], [11, 61, 62], [13, 72, 73], [8, 74, 75, 76], [30, 68, 69, 77, 78], [27, 49, 50, 59, 51, 60], [13, 70, 71, 79, 80], [18, 37, 46, 55, 64, 56], [11, 2, 3, 11, 12], [27, 19, 28, 20, 29], [24, 65, 66, 58, 67], [23, 34, 35, 43, 52], [29, 4, 13, 5, 14, 23], [25, 21, 30, 22, 31, 32], [21, 6, 15, 7, 8]])] },
    ],
  },
  'kropki': {
    'hard': [
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[3, 12], [6, 15], [13, 14], [20, 21], [21, 22], [24, 25], [25, 34], [26, 35], [28, 37], [32, 33], [33, 42], [36, 45], [40, 41], [45, 54], [50, 51], [55, 56], [59, 68], [61, 62], [64, 65], [67, 76]] }, ratioTwo: { pairs: [[14, 15], [14, 23], [20, 29], [21, 22], [32, 33], [33, 42], [37, 46], [39, 40], [46, 55], [60, 61], [61, 62], [74, 75], [75, 76], [77, 78]] }, type: 'kropki' }] },
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[6, 15], [7, 8], [13, 14], [20, 21], [21, 22], [24, 25], [25, 34], [26, 35], [28, 37], [32, 33], [33, 42], [36, 45], [40, 41], [45, 54], [50, 51], [55, 56], [59, 68], [61, 62], [64, 65], [67, 76]] }, ratioTwo: { pairs: [[14, 15], [14, 23], [20, 29], [21, 22], [28, 29], [32, 33], [33, 42], [37, 46], [39, 40], [46, 55], [60, 61], [61, 62], [74, 75], [75, 76], [77, 78]] }, type: 'kropki' }] },
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[3, 12], [7, 8], [13, 14], [20, 21], [21, 22], [24, 25], [25, 34], [26, 35], [28, 37], [32, 33], [33, 42], [36, 45], [40, 41], [45, 54], [50, 51], [55, 56], [59, 68], [61, 62], [64, 65], [67, 76]] }, ratioTwo: { pairs: [[14, 15], [14, 23], [20, 29], [21, 22], [28, 29], [32, 33], [33, 42], [37, 46], [39, 40], [46, 55], [60, 61], [61, 62], [74, 75], [75, 76], [77, 78]] }, type: 'kropki' }] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[1, 2], [9, 10], [12, 21], [15, 16], [15, 24], [16, 25], [22, 31], [23, 24], [28, 37], [30, 39], [31, 32], [33, 42], [34, 43], [35, 44], [39, 48], [41, 42], [43, 44], [45, 54], [48, 57], [49, 50], [51, 52], [52, 61], [57, 58], [60, 69], [61, 70], [62, 71], [63, 64], [66, 75], [79, 80]] }, ratioTwo: { pairs: [[4, 13], [16, 25], [22, 23], [28, 37], [35, 44], [36, 45], [46, 47], [49, 50], [54, 63], [60, 69], [61, 62], [66, 75], [67, 68], [71, 80], [72, 73], [73, 74]] }, type: 'kropki' }] },
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[2, 3], [19, 20], [20, 21], [23, 32], [29, 38], [30, 31], [32, 41], [42, 43], [42, 51], [49, 50], [52, 53], [54, 55], [56, 57], [57, 58], [60, 61], [62, 71], [64, 73], [70, 71], [75, 76]] }, ratioTwo: { pairs: [[4, 13], [12, 21], [14, 15], [14, 23], [29, 38], [33, 42], [47, 56], [54, 55], [57, 66], [61, 70], [70, 79], [72, 73]] }, type: 'kropki' }] },
    ],
    'expert': [
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[0, 1], [2, 11], [7, 8], [12, 13], [12, 21], [19, 20], [24, 25], [31, 40], [33, 34], [42, 51], [43, 44], [45, 46], [47, 48], [49, 50], [50, 51], [50, 59], [54, 55], [58, 67], [60, 61], [64, 65], [65, 74], [68, 69], [70, 71], [72, 73], [75, 76]] }, ratioTwo: { pairs: [[2, 3], [5, 14], [23, 24], [25, 26], [34, 35], [40, 49], [43, 44], [45, 54], [47, 48], [51, 60], [54, 55], [76, 77]] }, type: 'kropki' }] },
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[9, 10], [12, 21], [15, 16], [15, 24], [22, 31], [31, 32], [33, 42], [34, 43], [35, 44], [39, 48], [41, 42], [43, 44], [45, 54], [49, 50], [51, 52], [52, 61], [57, 58], [60, 69], [61, 70], [63, 64], [66, 75], [79, 80]] }, ratioTwo: { pairs: [[4, 13], [16, 25], [22, 23], [28, 37], [35, 44], [46, 47], [49, 50], [54, 63], [61, 62], [66, 75], [67, 68], [71, 80], [72, 73], [73, 74]] }, type: 'kropki' }] },
    ],
    'master': [
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[47, 48], [50, 59], [42, 51], [7, 8], [70, 71], [72, 73], [50, 51], [12, 21], [12, 13], [24, 25], [75, 76], [64, 65], [2, 11], [58, 67], [54, 55], [43, 44], [45, 46], [65, 74], [49, 50], [31, 40], [68, 69], [19, 20], [0, 1], [33, 34], [60, 61]] }, ratioTwo: { pairs: [[43, 44], [2, 3], [51, 60], [5, 14], [45, 54], [34, 35], [25, 26], [23, 24], [54, 55], [47, 48], [40, 49]] }, type: 'kropki' }] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [{ consecutive: { pairs: [[4, 5], [4, 13], [6, 15], [7, 16], [10, 19], [17, 26], [21, 30], [24, 25], [36, 45], [37, 46], [38, 47], [40, 49], [42, 51], [44, 53], [52, 53], [55, 64], [56, 65], [68, 69], [69, 78], [70, 71], [71, 80], [72, 73]] }, ratioTwo: { pairs: [[0, 1], [3, 4], [3, 12], [6, 15], [10, 11], [11, 12], [18, 27], [22, 31], [27, 36], [37, 46], [38, 39], [51, 60], [59, 60], [60, 61], [64, 65], [69, 70], [71, 80]] }, type: 'kropki' }] },
    ],
  },
  'little-killer': {
    'hard': [
      { givens: EMPTY, rules: [
        littleKiller(4, 'south-east', 5, 17), littleKiller(26, 'south-west', 7, 41), littleKiller(2, 'south-east', 7, 34),
        littleKiller(63, 'south-east', 2, 5), littleKiller(4, 'south-west', 5, 20), littleKiller(44, 'south-west', 5, 17),
        littleKiller(71, 'south-west', 2, 10), littleKiller(2, 'south-west', 3, 16), littleKiller(8, 'south-west', 9, 45),
        littleKiller(27, 'south-east', 6, 27), littleKiller(45, 'south-east', 4, 13), littleKiller(6, 'south-west', 7, 61),
        littleKiller(3, 'south-west', 4, 20), littleKiller(7, 'south-east', 2, 9), littleKiller(1, 'south-east', 8, 52),
        littleKiller(36, 'south-east', 5, 38), littleKiller(3, 'south-east', 6, 32), littleKiller(9, 'south-east', 8, 27),
        littleKiller(17, 'south-west', 8, 11), littleKiller(53, 'south-west', 4, 26),
      ] },
      { givens: EMPTY, rules: [
        littleKiller(1, 'south-east', 8, 52), littleKiller(2, 'south-east', 7, 34), littleKiller(3, 'south-east', 6, 32),
        littleKiller(4, 'south-east', 5, 17), littleKiller(7, 'south-east', 2, 9), littleKiller(9, 'south-east', 8, 27),
        littleKiller(18, 'south-east', 7, 41), littleKiller(27, 'south-east', 6, 27), littleKiller(36, 'south-east', 5, 38),
        littleKiller(45, 'south-east', 4, 13), littleKiller(63, 'south-east', 2, 5), littleKiller(2, 'south-west', 3, 16),
        littleKiller(3, 'south-west', 4, 20), littleKiller(4, 'south-west', 5, 20), littleKiller(6, 'south-west', 7, 61),
        littleKiller(8, 'south-west', 9, 45), littleKiller(17, 'south-west', 8, 11), littleKiller(26, 'south-west', 7, 41),
        littleKiller(44, 'south-west', 5, 17), littleKiller(53, 'south-west', 4, 26), littleKiller(71, 'south-west', 2, 10),
      ] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        littleKiller(8, 'south-west', 9, 40), littleKiller(3, 'south-west', 4, 28), littleKiller(35, 'south-west', 6, 32),
        littleKiller(0, 'south-east', 9, 44), littleKiller(71, 'south-west', 2, 5), littleKiller(54, 'south-east', 3, 6),
        littleKiller(27, 'south-east', 6, 29), littleKiller(36, 'south-east', 5, 21), littleKiller(17, 'south-west', 8, 45),
        littleKiller(18, 'south-east', 7, 61), littleKiller(6, 'south-east', 3, 18), littleKiller(3, 'south-east', 6, 31),
        littleKiller(2, 'south-east', 7, 9), littleKiller(45, 'south-east', 4, 23), littleKiller(1, 'south-west', 2, 7),
        littleKiller(2, 'south-west', 3, 17), littleKiller(7, 'south-east', 2, 17), littleKiller(26, 'south-west', 7, 33),
        littleKiller(5, 'south-west', 6, 23), littleKiller(62, 'south-west', 3, 15), littleKiller(4, 'south-west', 5, 29),
        littleKiller(9, 'south-east', 8, 35), littleKiller(53, 'south-west', 4, 23), littleKiller(63, 'south-east', 2, 12),
        littleKiller(44, 'south-west', 5, 22), littleKiller(4, 'south-east', 5, 29),
      ] },
      { givens: EMPTY, rules: [
        littleKiller(0, 'south-east', 9, 44), littleKiller(2, 'south-east', 7, 9), littleKiller(3, 'south-east', 6, 31),
        littleKiller(4, 'south-east', 5, 29), littleKiller(6, 'south-east', 3, 18), littleKiller(7, 'south-east', 2, 17),
        littleKiller(9, 'south-east', 8, 35), littleKiller(18, 'south-east', 7, 61), littleKiller(27, 'south-east', 6, 29),
        littleKiller(36, 'south-east', 5, 21), littleKiller(45, 'south-east', 4, 23), littleKiller(54, 'south-east', 3, 6),
        littleKiller(63, 'south-east', 2, 12), littleKiller(1, 'south-west', 2, 7), littleKiller(2, 'south-west', 3, 17),
        littleKiller(3, 'south-west', 4, 28), littleKiller(4, 'south-west', 5, 29), littleKiller(5, 'south-west', 6, 23),
        littleKiller(7, 'south-west', 8, 45), littleKiller(8, 'south-west', 9, 40), littleKiller(17, 'south-west', 8, 45),
        littleKiller(26, 'south-west', 7, 33), littleKiller(35, 'south-west', 6, 32), littleKiller(44, 'south-west', 5, 22),
        littleKiller(53, 'south-west', 4, 23), littleKiller(62, 'south-west', 3, 15), littleKiller(71, 'south-west', 2, 5),
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        littleKiller(1, 'south-east', 8, 35), littleKiller(2, 'south-east', 7, 38), littleKiller(4, 'south-east', 5, 11),
        littleKiller(5, 'south-east', 4, 26), littleKiller(6, 'south-east', 3, 14), littleKiller(9, 'south-east', 8, 36),
        littleKiller(18, 'south-east', 7, 27), littleKiller(27, 'south-east', 6, 37), littleKiller(36, 'south-east', 5, 21),
        littleKiller(45, 'south-east', 4, 25), littleKiller(54, 'south-east', 3, 11), littleKiller(1, 'south-west', 2, 3),
        littleKiller(3, 'south-west', 4, 18), littleKiller(4, 'south-west', 5, 21), littleKiller(5, 'south-west', 6, 35),
        littleKiller(6, 'south-west', 7, 30), littleKiller(7, 'south-west', 8, 69), littleKiller(8, 'south-west', 9, 37),
        littleKiller(17, 'south-west', 8, 42), littleKiller(26, 'south-west', 7, 9), littleKiller(44, 'south-west', 5, 31),
        littleKiller(62, 'south-west', 3, 24), littleKiller(71, 'south-west', 2, 5),
      ] },
      { givens: EMPTY, rules: [
        littleKiller(0, 'south-east', 9, 56), littleKiller(1, 'south-east', 8, 39), littleKiller(3, 'south-east', 6, 33),
        littleKiller(4, 'south-east', 5, 24), littleKiller(5, 'south-east', 4, 19), littleKiller(6, 'south-east', 3, 13),
        littleKiller(7, 'south-east', 2, 10), littleKiller(9, 'south-east', 8, 26), littleKiller(18, 'south-east', 7, 32),
        littleKiller(36, 'south-east', 5, 20), littleKiller(45, 'south-east', 4, 23), littleKiller(54, 'south-east', 3, 15),
        littleKiller(63, 'south-east', 2, 8), littleKiller(1, 'south-west', 2, 3), littleKiller(2, 'south-west', 3, 21),
        littleKiller(3, 'south-west', 4, 19), littleKiller(4, 'south-west', 5, 14), littleKiller(6, 'south-west', 7, 61),
        littleKiller(7, 'south-west', 8, 45), littleKiller(8, 'south-west', 9, 49), littleKiller(26, 'south-west', 7, 9),
        littleKiller(35, 'south-west', 6, 35), littleKiller(44, 'south-west', 5, 27), littleKiller(53, 'south-west', 4, 21),
        littleKiller(62, 'south-west', 3, 9), littleKiller(71, 'south-west', 2, 17),
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        littleKiller(0, 'south-east', 9, 58), littleKiller(1, 'south-east', 8, 11), littleKiller(2, 'south-east', 7, 36),
        littleKiller(3, 'south-east', 6, 33), littleKiller(4, 'south-east', 5, 28), littleKiller(5, 'south-east', 4, 23),
        littleKiller(6, 'south-east', 3, 19), littleKiller(7, 'south-east', 2, 9), littleKiller(9, 'south-east', 8, 41),
        littleKiller(18, 'south-east', 7, 42), littleKiller(27, 'south-east', 6, 29), littleKiller(36, 'south-east', 5, 29),
        littleKiller(45, 'south-east', 4, 20), littleKiller(63, 'south-east', 2, 8), littleKiller(1, 'south-west', 2, 9),
        littleKiller(2, 'south-west', 3, 18), littleKiller(3, 'south-west', 4, 16), littleKiller(4, 'south-west', 5, 18),
        littleKiller(5, 'south-west', 6, 22), littleKiller(6, 'south-west', 7, 61), littleKiller(8, 'south-west', 9, 35),
        littleKiller(17, 'south-west', 8, 43), littleKiller(26, 'south-west', 7, 34), littleKiller(35, 'south-west', 6, 12),
        littleKiller(44, 'south-west', 5, 29), littleKiller(53, 'south-west', 4, 24), littleKiller(62, 'south-west', 3, 24),
      ] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [
        littleKiller(0, 'south-east', 9, 38), littleKiller(1, 'south-east', 8, 50), littleKiller(2, 'south-east', 7, 27),
        littleKiller(4, 'south-east', 5, 23), littleKiller(5, 'south-east', 4, 25), littleKiller(7, 'south-east', 2, 14),
        littleKiller(9, 'south-east', 8, 42), littleKiller(18, 'south-east', 7, 33), littleKiller(27, 'south-east', 6, 30),
        littleKiller(36, 'south-east', 5, 26), littleKiller(54, 'south-east', 3, 8), littleKiller(63, 'south-east', 2, 10),
        littleKiller(1, 'south-west', 2, 14), littleKiller(2, 'south-west', 3, 10), littleKiller(5, 'south-west', 6, 41),
        littleKiller(6, 'south-west', 7, 9), littleKiller(7, 'south-west', 8, 39), littleKiller(8, 'south-west', 9, 43),
        littleKiller(17, 'south-west', 8, 69), littleKiller(26, 'south-west', 7, 32), littleKiller(35, 'south-west', 6, 27),
        littleKiller(53, 'south-west', 4, 14), littleKiller(62, 'south-west', 3, 6), littleKiller(71, 'south-west', 2, 12),
      ] },
    ],
  },
  'quadruple': {
    'hard': [
      { givens: EMPTY, rules: [{ digits: [3, 4, 6], topLeft: 47, type: 'quadruple' }, { digits: [1, 5, 9], topLeft: 34, type: 'quadruple' }, { digits: [4, 5, 8], topLeft: 65, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 41, type: 'quadruple' }, { digits: [2, 7, 9], topLeft: 12, type: 'quadruple' }, { digits: [2, 6, 7], topLeft: 52, type: 'quadruple' }, { digits: [2, 9, 9], topLeft: 21, type: 'quadruple' }, { digits: [4, 6, 8], topLeft: 33, type: 'quadruple' }, { digits: [4, 5, 7], topLeft: 18, type: 'quadruple' }, { digits: [2, 5, 7], topLeft: 19, type: 'quadruple' }, { digits: [1, 4, 9], topLeft: 22, type: 'quadruple' }, { digits: [1, 5, 8], topLeft: 49, type: 'quadruple' }, { digits: [2, 3, 5], topLeft: 42, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 40, type: 'quadruple' }, { digits: [2, 2, 6], topLeft: 20, type: 'quadruple' }, { digits: [5, 7, 9], topLeft: 2, type: 'quadruple' }, { digits: [5, 8, 9], topLeft: 1, type: 'quadruple' }, { digits: [2, 6, 9], topLeft: 7, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 50, type: 'quadruple' }, { digits: [4, 6, 7], topLeft: 36, type: 'quadruple' }, { digits: [8, 9, 9], topLeft: 59, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 16, type: 'quadruple' }] },
      { givens: EMPTY, rules: [{ digits: [3, 4, 6], topLeft: 47, type: 'quadruple' }, { digits: [1, 5, 9], topLeft: 34, type: 'quadruple' }, { digits: [4, 5, 8], topLeft: 65, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 41, type: 'quadruple' }, { digits: [2, 7, 9], topLeft: 12, type: 'quadruple' }, { digits: [2, 6, 7], topLeft: 52, type: 'quadruple' }, { digits: [2, 9, 9], topLeft: 21, type: 'quadruple' }, { digits: [4, 6, 8], topLeft: 33, type: 'quadruple' }, { digits: [4, 5, 7], topLeft: 18, type: 'quadruple' }, { digits: [2, 5, 7], topLeft: 19, type: 'quadruple' }, { digits: [1, 4, 9], topLeft: 22, type: 'quadruple' }, { digits: [1, 5, 8], topLeft: 49, type: 'quadruple' }, { digits: [2, 3, 5], topLeft: 42, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 40, type: 'quadruple' }, { digits: [5, 7, 9], topLeft: 2, type: 'quadruple' }, { digits: [5, 8, 9], topLeft: 1, type: 'quadruple' }, { digits: [2, 6, 9], topLeft: 7, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 50, type: 'quadruple' }, { digits: [4, 6, 7], topLeft: 36, type: 'quadruple' }, { digits: [8, 9, 9], topLeft: 59, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 16, type: 'quadruple' }] },
      { givens: EMPTY, rules: [{ digits: [4, 7, 9], topLeft: 54, type: 'quadruple' }, { digits: [3, 4, 7], topLeft: 3, type: 'quadruple' }, { digits: [1, 4, 9], topLeft: 45, type: 'quadruple' }, { digits: [1, 3, 7], topLeft: 16, type: 'quadruple' }, { digits: [2, 3, 9], topLeft: 49, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 33, type: 'quadruple' }, { digits: [1, 5, 9], topLeft: 1, type: 'quadruple' }, { digits: [3, 4, 5], topLeft: 10, type: 'quadruple' }, { digits: [4, 5, 8], topLeft: 18, type: 'quadruple' }, { digits: [1, 4, 7], topLeft: 60, type: 'quadruple' }, { digits: [2, 4, 9], topLeft: 48, type: 'quadruple' }, { digits: [1, 3, 4], topLeft: 59, type: 'quadruple' }, { digits: [2, 8, 9], topLeft: 20, type: 'quadruple' }, { digits: [5, 6, 8], topLeft: 69, type: 'quadruple' }, { digits: [3, 6, 8], topLeft: 9, type: 'quadruple' }, { digits: [1, 6, 8], topLeft: 30, type: 'quadruple' }, { digits: [1, 2, 5], topLeft: 0, type: 'quadruple' }] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        { digits: [2, 6, 7], topLeft: 52, type: 'quadruple' }, { digits: [2, 9, 9], topLeft: 21, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 41, type: 'quadruple' },
        { digits: [1, 5, 9], topLeft: 34, type: 'quadruple' }, { digits: [3, 7, 6], topLeft: 10, type: 'quadruple' }, { digits: [4, 5, 8], topLeft: 65, type: 'quadruple' },
        { digits: [2, 7, 9], topLeft: 12, type: 'quadruple' }, { digits: [2, 2, 6], topLeft: 20, type: 'quadruple' }, { digits: [4, 6, 7], topLeft: 36, type: 'quadruple' },
        { digits: [1, 5, 6], topLeft: 23, type: 'quadruple' }, { digits: [4, 5, 7], topLeft: 18, type: 'quadruple' }, { digits: [2, 3, 5], topLeft: 42, type: 'quadruple' },
        { digits: [3, 8, 9], topLeft: 50, type: 'quadruple' }, { digits: [2, 6, 9], topLeft: 7, type: 'quadruple' }, { digits: [4, 6, 8], topLeft: 33, type: 'quadruple' },
        { digits: [1, 5, 8], topLeft: 49, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 16, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 40, type: 'quadruple' },
        { digits: [5, 8, 9], topLeft: 1, type: 'quadruple' }, { digits: [8, 9, 9], topLeft: 59, type: 'quadruple' }, { digits: [3, 4, 6], topLeft: 47, type: 'quadruple' },
      ] },
      { givens: EMPTY, rules: [
        { digits: [4, 6, 8], topLeft: 33, type: 'quadruple' }, { digits: [5, 7, 9], topLeft: 2, type: 'quadruple' }, { digits: [2, 5, 7], topLeft: 19, type: 'quadruple' },
        { digits: [4, 5, 8], topLeft: 65, type: 'quadruple' }, { digits: [1, 4, 9], topLeft: 22, type: 'quadruple' }, { digits: [2, 3, 8], topLeft: 40, type: 'quadruple' },
        { digits: [2, 3, 8], topLeft: 41, type: 'quadruple' }, { digits: [4, 6, 7], topLeft: 36, type: 'quadruple' }, { digits: [3, 4, 6], topLeft: 47, type: 'quadruple' },
        { digits: [8, 9, 9], topLeft: 59, type: 'quadruple' }, { digits: [2, 6, 9], topLeft: 7, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 50, type: 'quadruple' },
        { digits: [2, 3, 5], topLeft: 42, type: 'quadruple' }, { digits: [2, 7, 9], topLeft: 12, type: 'quadruple' }, { digits: [7, 1, 9], topLeft: 6, type: 'quadruple' },
        { digits: [3, 8, 9], topLeft: 16, type: 'quadruple' }, { digits: [2, 6, 7], topLeft: 52, type: 'quadruple' }, { digits: [2, 9, 9], topLeft: 21, type: 'quadruple' },
        { digits: [1, 5, 9], topLeft: 34, type: 'quadruple' }, { digits: [5, 8, 9], topLeft: 1, type: 'quadruple' }, { digits: [3, 7, 8], topLeft: 3, type: 'quadruple' },
        { digits: [6, 1, 9], topLeft: 63, type: 'quadruple' }, { digits: [8, 7, 9], topLeft: 60, type: 'quadruple' },
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        { digits: [2, 4, 5], topLeft: 45, type: 'quadruple' }, { digits: [2, 5, 6], topLeft: 19, type: 'quadruple' }, { digits: [2, 6, 9], topLeft: 20, type: 'quadruple' },
        { digits: [1, 5, 9], topLeft: 49, type: 'quadruple' }, { digits: [1, 9, 2], topLeft: 58, type: 'quadruple' }, { digits: [5, 8, 9], topLeft: 1, type: 'quadruple' },
        { digits: [6, 4, 5], topLeft: 33, type: 'quadruple' }, { digits: [6, 3, 4], topLeft: 47, type: 'quadruple' }, { digits: [2, 7, 8], topLeft: 12, type: 'quadruple' },
        { digits: [4, 7, 9], topLeft: 60, type: 'quadruple' }, { digits: [1, 4, 8], topLeft: 57, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 59, type: 'quadruple' },
        { digits: [4, 7, 9], topLeft: 36, type: 'quadruple' }, { digits: [1, 3, 5], topLeft: 15, type: 'quadruple' }, { digits: [3, 4, 9], topLeft: 16, type: 'quadruple' },
        { digits: [2, 4, 9], topLeft: 7, type: 'quadruple' }, { digits: [3, 5, 7], topLeft: 2, type: 'quadruple' }, { digits: [4, 1, 3], topLeft: 70, type: 'quadruple' },
        { digits: [5, 8, 9], topLeft: 34, type: 'quadruple' }, { digits: [5, 6, 1], topLeft: 5, type: 'quadruple' },
      ] },
      { givens: EMPTY, rules: [
        { digits: [3, 4, 5], topLeft: 10, type: 'quadruple' }, { digits: [1, 4, 9], topLeft: 45, type: 'quadruple' }, { digits: [2, 4, 5], topLeft: 43, type: 'quadruple' },
        { digits: [2, 4, 9], topLeft: 48, type: 'quadruple' }, { digits: [2, 3, 9], topLeft: 49, type: 'quadruple' }, { digits: [4, 7, 9], topLeft: 54, type: 'quadruple' },
        { digits: [1, 3, 4], topLeft: 59, type: 'quadruple' }, { digits: [1, 3, 7], topLeft: 16, type: 'quadruple' }, { digits: [3, 6, 8], topLeft: 9, type: 'quadruple' },
        { digits: [3, 8, 9], topLeft: 33, type: 'quadruple' }, { digits: [8, 9, 1], topLeft: 5, type: 'quadruple' }, { digits: [3, 4, 7], topLeft: 3, type: 'quadruple' },
        { digits: [4, 5, 8], topLeft: 18, type: 'quadruple' }, { digits: [1, 5, 9], topLeft: 1, type: 'quadruple' }, { digits: [2, 8, 9], topLeft: 20, type: 'quadruple' },
        { digits: [1, 6, 8], topLeft: 30, type: 'quadruple' }, { digits: [1, 2, 5], topLeft: 0, type: 'quadruple' }, { digits: [9, 5, 8], topLeft: 58, type: 'quadruple' },
        { digits: [7, 6, 7], topLeft: 51, type: 'quadruple' }, { digits: [1, 2, 5], topLeft: 64, type: 'quadruple' },
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        { digits: [5, 8, 9], topLeft: 34, type: 'quadruple' }, { digits: [2, 7, 8], topLeft: 12, type: 'quadruple' }, { digits: [1, 4, 8], topLeft: 57, type: 'quadruple' },
        { digits: [1, 3, 5], topLeft: 15, type: 'quadruple' }, { digits: [2, 5, 6], topLeft: 19, type: 'quadruple' }, { digits: [1, 5, 9], topLeft: 49, type: 'quadruple' },
        { digits: [2, 3, 8], topLeft: 40, type: 'quadruple' }, { digits: [2, 6, 9], topLeft: 20, type: 'quadruple' }, { digits: [3, 5, 7], topLeft: 2, type: 'quadruple' },
        { digits: [4, 7, 9], topLeft: 60, type: 'quadruple' }, { digits: [2, 4, 5], topLeft: 45, type: 'quadruple' }, { digits: [5, 8, 9], topLeft: 1, type: 'quadruple' },
        { digits: [2, 4, 9], topLeft: 7, type: 'quadruple' }, { digits: [4, 7, 9], topLeft: 36, type: 'quadruple' }, { digits: [3, 8, 9], topLeft: 59, type: 'quadruple' },
        { digits: [3, 4, 9], topLeft: 16, type: 'quadruple' },
      ] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [
        { digits: [2, 4, 9], topLeft: 32, type: 'quadruple' }, { digits: [9, 3, 8], topLeft: 10, type: 'quadruple' }, { digits: [1, 5, 6], topLeft: 70, type: 'quadruple' },
        { digits: [3, 6, 8], topLeft: 49, type: 'quadruple' }, { digits: [1, 2, 9], topLeft: 9, type: 'quadruple' }, { digits: [6, 7, 9], topLeft: 42, type: 'quadruple' },
        { digits: [1, 3, 4], topLeft: 2, type: 'quadruple' }, { digits: [1, 3, 7], topLeft: 28, type: 'quadruple' }, { digits: [1, 3, 9], topLeft: 40, type: 'quadruple' },
        { digits: [1, 2, 3], topLeft: 45, type: 'quadruple' }, { digits: [2, 4, 7], topLeft: 16, type: 'quadruple' }, { digits: [3, 5, 5], topLeft: 56, type: 'quadruple' },
        { digits: [4, 5, 8], topLeft: 21, type: 'quadruple' }, { digits: [4, 6, 8], topLeft: 58, type: 'quadruple' }, { digits: [2, 3, 4], topLeft: 36, type: 'quadruple' },
        { digits: [8, 4, 8], topLeft: 59, type: 'quadruple' }, { digits: [6, 8, 9], topLeft: 19, type: 'quadruple' }, { digits: [4, 6, 3], topLeft: 13, type: 'quadruple' },
      ] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [
        { digits: [5, 6, 7], topLeft: 55, type: 'quadruple' }, { digits: [6, 7, 8], topLeft: 15, type: 'quadruple' }, { digits: [2, 4, 6], topLeft: 69, type: 'quadruple' },
        { digits: [1, 3, 5], topLeft: 56, type: 'quadruple' }, { digits: [5, 7, 8], topLeft: 28, type: 'quadruple' }, { digits: [1, 3, 4], topLeft: 70, type: 'quadruple' },
        { digits: [3, 4, 7], topLeft: 21, type: 'quadruple' }, { digits: [1, 4, 9], topLeft: 10, type: 'quadruple' }, { digits: [1, 2, 7], topLeft: 7, type: 'quadruple' },
        { digits: [3, 5, 9], topLeft: 43, type: 'quadruple' }, { digits: [2, 4, 9], topLeft: 59, type: 'quadruple' }, { digits: [1, 2, 4], topLeft: 23, type: 'quadruple' },
        { digits: [5, 6, 8], topLeft: 27, type: 'quadruple' }, { digits: [4, 8, 9], topLeft: 63, type: 'quadruple' }, { digits: [2, 3, 7], topLeft: 46, type: 'quadruple' },
        { digits: [2, 5, 8], topLeft: 34, type: 'quadruple' }, { digits: [2, 8, 9], topLeft: 13, type: 'quadruple' },
      ] },
    ],
  },
  'region-sum': {
    'hard': [
      { givens: EMPTY, rules: regionSums([
        [18, 10, 11, 21], [48, 57, 67, 58], [42, 51, 41, 40, 50, 59], [21, 29, 38, 30, 40, 41], [10, 20, 28, 38, 47], [68, 58, 49, 50, 60, 70],
        [45, 46, 56, 66, 58], [59, 69, 79, 70], [56, 57, 67], [15, 14, 23, 31, 30], [64, 74, 66], [1, 11, 20, 21, 31],
        [27, 19, 28, 36], [2, 11, 21], [16, 26, 35],
      ]) },
      { givens: EMPTY, rules: regionSums([
        [2, 11, 21], [48, 57, 67, 58], [10, 20, 28, 38, 47], [42, 51, 41, 40, 50, 59], [15, 14, 23, 31, 30], [59, 69, 79, 70],
        [56, 57, 67], [21, 29, 38, 30, 40, 41], [1, 11, 20, 21, 31], [19, 28, 36], [68, 58, 49, 50, 60, 70], [45, 46, 56, 66, 58],
        [64, 74, 66], [59, 69, 61], [18, 10, 11, 21],
      ]) },
    ],
    'expert': [
      { givens: EMPTY, rules: regionSums([
        [6, 16, 24, 34], [49, 58, 66, 75, 65, 55], [65, 73, 74, 66, 57, 67], [31, 40, 50, 59, 49], [0, 10, 20, 29, 39, 48], [37, 47, 46, 55, 63, 73],
        [56, 57, 67], [29, 39, 48, 58, 67], [4, 3, 11, 10, 20, 30], [20, 19, 27, 37, 46], [44, 53, 61, 60, 59], [63, 73, 65, 75],
        [35, 44, 52, 60, 68],
      ]) },
      { givens: EMPTY, rules: regionSums([
        [28, 29, 30, 31, 32, 42], [21, 13, 23, 24, 34], [18, 19, 27, 37], [22, 32, 40, 49], [42, 52, 62], [8, 17, 25, 33, 41],
        [59, 58, 57, 65], [9, 19, 20, 28, 18], [10, 19, 28, 29, 20, 11], [15, 25, 34, 44], [72, 73, 65, 66, 74], [9, 18, 27],
        [7, 6, 14], [45, 54, 63, 72],
      ]) },
    ],
    'master': [
      { givens: EMPTY, rules: regionSums([
        [28, 38, 39, 31], [37, 46, 55, 56], [59, 69, 61], [67, 66, 74, 73], [5, 14, 24, 34], [39, 48, 56, 64, 74, 66],
        [42, 52, 53, 62, 70, 61], [39, 48, 56, 64, 74], [31, 40, 39, 38, 46, 55], [24, 32, 40], [27, 19, 28, 36], [39, 40, 32, 42, 51],
        [13, 21, 31, 40], [40, 48, 38, 47, 55, 56], [69, 68, 67, 76], [24, 25, 33, 43], [59, 49, 57, 67, 68], [16, 26, 34],
        [19, 28, 36], [60, 68, 77, 78, 70], [17, 25, 26, 34], [4, 5, 6], [49, 57, 67, 68, 60, 70], [23, 33, 42],
        [31, 41, 42, 51, 59], [1, 10, 20, 28, 37, 45], [13, 21, 29], [43, 53, 61, 71], [49, 58, 68, 60, 70], [9, 10, 20, 28, 38],
        [9, 10, 2, 3, 13, 21], [73, 74, 75, 76], [17, 25, 26, 34, 24], [50, 42, 52, 61, 71], [5, 14, 24, 23, 13], [14, 15, 25, 26],
        [7, 17, 25, 33, 43], [10, 18, 27], [1, 10, 20, 12], [65, 75, 76], [7, 15, 14], [37, 45, 55],
      ]) },
    ],
    'extreme': [
      { givens: EMPTY, rules: regionSums([
        [20, 28, 36, 46, 55, 63], [5, 15, 25, 34, 44], [18, 19, 29, 39, 40], [47, 55, 65], [17, 26, 35], [14, 23, 31, 32, 22],
        [23, 15, 24, 34, 33, 42], [44, 53, 61, 62, 71], [6, 14, 13], [49, 59, 69, 70], [3, 13, 14, 15, 24, 23], [22, 30, 39],
        [76, 67, 68, 69, 77], [36, 46, 47, 56, 48], [34, 42, 41, 50], [60, 52, 61, 70, 62], [38, 46, 56],
      ]) },
      { givens: EMPTY, rules: regionSums([
        [39, 48, 56, 64, 74, 66], [49, 58, 68, 60, 70], [27, 19, 28, 36], [60, 68, 77, 78, 70], [4, 5, 6], [14, 15, 25, 26],
        [5, 13, 21, 11], [69, 68, 67, 76], [24, 32, 40], [37, 45, 55], [1, 10, 20, 12], [5, 14, 24, 23, 13],
        [59, 69, 61], [59, 49, 57, 67, 68], [50, 42, 52, 61, 71], [31, 41, 42, 51, 59], [23, 33, 42], [13, 21, 29, 39, 40, 41],
      ]) },
    ],
  },
  'skyscrapers': {
    'hard': [
      { givens: EMPTY, rules: [
        skyscraper(0, 'east', 9), skyscraper(9, 'east', 6), skyscraper(18, 'east', 3),
        skyscraper(27, 'east', 8), skyscraper(36, 'east', 5), skyscraper(45, 'east', 2),
        skyscraper(54, 'east', 7), skyscraper(63, 'east', 4), skyscraper(72, 'east', 1),
        skyscraper(8, 'west', 1), skyscraper(17, 'west', 2), skyscraper(26, 'west', 2),
        skyscraper(35, 'west', 2), skyscraper(44, 'west', 2), skyscraper(53, 'west', 2),
        skyscraper(62, 'west', 2), skyscraper(71, 'west', 2), skyscraper(80, 'west', 2),
        skyscraper(0, 'south', 5), skyscraper(1, 'south', 4), skyscraper(2, 'south', 3),
        skyscraper(3, 'south', 4), skyscraper(4, 'south', 3), skyscraper(5, 'south', 2),
        skyscraper(6, 'south', 3), skyscraper(7, 'south', 2), skyscraper(8, 'south', 1),
        skyscraper(72, 'north', 1), skyscraper(73, 'north', 3), skyscraper(74, 'north', 3),
        skyscraper(75, 'north', 2), skyscraper(76, 'north', 3), skyscraper(77, 'north', 3),
        skyscraper(78, 'north', 2), skyscraper(79, 'north', 2), skyscraper(80, 'north', 2),
      ] },
      { givens: EMPTY, rules: [
        skyscraper(0, 'east', 9), skyscraper(9, 'east', 3), skyscraper(18, 'east', 6),
        skyscraper(27, 'east', 8), skyscraper(36, 'east', 2), skyscraper(45, 'east', 5),
        skyscraper(54, 'east', 1), skyscraper(63, 'east', 7), skyscraper(72, 'east', 4),
        skyscraper(8, 'west', 1), skyscraper(17, 'west', 2), skyscraper(26, 'west', 2),
        skyscraper(35, 'west', 2), skyscraper(44, 'west', 2), skyscraper(53, 'west', 2),
        skyscraper(62, 'west', 2), skyscraper(71, 'west', 2), skyscraper(80, 'west', 2),
        skyscraper(0, 'south', 4), skyscraper(1, 'south', 3), skyscraper(2, 'south', 2),
        skyscraper(3, 'south', 4), skyscraper(4, 'south', 3), skyscraper(5, 'south', 2),
        skyscraper(6, 'south', 3), skyscraper(7, 'south', 2), skyscraper(8, 'south', 1),
        skyscraper(72, 'north', 2), skyscraper(73, 'north', 2), skyscraper(74, 'north', 2),
        skyscraper(75, 'north', 1), skyscraper(76, 'north', 3), skyscraper(77, 'north', 3),
        skyscraper(78, 'north', 2), skyscraper(79, 'north', 3), skyscraper(80, 'north', 3),
      ] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        skyscraper(8, 'west', 2), skyscraper(71, 'west', 2), skyscraper(74, 'north', 2),
        skyscraper(5, 'south', 2), skyscraper(80, 'north', 3), skyscraper(79, 'north', 3),
        skyscraper(44, 'west', 2), skyscraper(35, 'west', 2), skyscraper(26, 'west', 2),
        skyscraper(53, 'west', 1), skyscraper(76, 'north', 1), skyscraper(8, 'south', 3),
        skyscraper(36, 'east', 6), skyscraper(18, 'east', 4), skyscraper(17, 'west', 2),
        skyscraper(80, 'west', 2), skyscraper(72, 'east', 5),
      ] },
      { givens: EMPTY, rules: [
        skyscraper(17, 'west', 2), skyscraper(72, 'east', 5), skyscraper(80, 'west', 2),
        skyscraper(71, 'west', 2), skyscraper(74, 'north', 2), skyscraper(44, 'west', 2),
        skyscraper(18, 'east', 4), skyscraper(8, 'west', 2), skyscraper(35, 'west', 2),
        skyscraper(76, 'north', 1), skyscraper(26, 'west', 2), skyscraper(79, 'north', 3),
        skyscraper(5, 'south', 2), skyscraper(36, 'east', 6), skyscraper(80, 'north', 3),
        skyscraper(53, 'west', 1), skyscraper(3, 'south', 2),
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        skyscraper(9, 'east', 1), skyscraper(18, 'east', 4), skyscraper(36, 'east', 6),
        skyscraper(72, 'east', 5), skyscraper(8, 'west', 2), skyscraper(17, 'west', 2),
        skyscraper(26, 'west', 2), skyscraper(35, 'west', 2), skyscraper(44, 'west', 2),
        skyscraper(53, 'west', 1), skyscraper(71, 'west', 2), skyscraper(80, 'west', 2),
        skyscraper(76, 'north', 1), skyscraper(78, 'north', 4), skyscraper(79, 'north', 3),
      ] },
      { givens: EMPTY, rules: [
        skyscraper(9, 'east', 3), skyscraper(18, 'east', 9), skyscraper(27, 'east', 5),
        skyscraper(36, 'east', 8), skyscraper(35, 'west', 2), skyscraper(44, 'west', 2),
        skyscraper(53, 'west', 2), skyscraper(71, 'west', 2), skyscraper(80, 'west', 2),
        skyscraper(2, 'south', 2), skyscraper(3, 'south', 3), skyscraper(4, 'south', 2),
        skyscraper(6, 'south', 5), skyscraper(7, 'south', 4), skyscraper(8, 'south', 3),
        skyscraper(72, 'north', 1), skyscraper(73, 'north', 4), skyscraper(74, 'north', 4),
        skyscraper(75, 'north', 3), skyscraper(76, 'north', 3), skyscraper(77, 'north', 3),
        skyscraper(80, 'north', 2),
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        skyscraper(36, 'east', 1), skyscraper(35, 'west', 2), skyscraper(0, 'east', 3),
        skyscraper(53, 'west', 2), skyscraper(44, 'west', 2), skyscraper(76, 'north', 2),
        skyscraper(17, 'west', 1), skyscraper(26, 'west', 2), skyscraper(0, 'south', 2),
        skyscraper(80, 'west', 2), skyscraper(71, 'west', 2), skyscraper(54, 'east', 5),
        skyscraper(73, 'north', 2), skyscraper(74, 'north', 4), skyscraper(63, 'east', 2),
        skyscraper(7, 'south', 3), skyscraper(6, 'south', 3), skyscraper(62, 'west', 2),
        skyscraper(77, 'north', 3), skyscraper(45, 'east', 7), skyscraper(18, 'east', 6),
        skyscraper(80, 'north', 4), skyscraper(75, 'north', 3), skyscraper(27, 'east', 4),
        skyscraper(5, 'south', 3), skyscraper(2, 'south', 1), skyscraper(79, 'north', 1),
        skyscraper(1, 'south', 2), skyscraper(72, 'north', 3), skyscraper(78, 'north', 2),
      ] },
    ],
  },
  'thermometer': {
    'hard': [
      { givens: EMPTY, rules: [
        { cells: [41, 40, 30], type: 'thermometer' }, { cells: [74, 64, 65], type: 'thermometer' }, { cells: [32, 31, 22], type: 'thermometer' },
        { cells: [47, 38, 46], type: 'thermometer' }, { cells: [73, 74, 64], type: 'thermometer' }, { cells: [23, 32, 24], type: 'thermometer' },
        { cells: [39, 48, 56], type: 'thermometer' }, { cells: [70, 69, 77], type: 'thermometer' }, { cells: [18, 28, 37], type: 'thermometer' },
        { cells: [26, 16, 15], type: 'thermometer' }, { cells: [49, 57, 65], type: 'thermometer' }, { cells: [21, 20, 19], type: 'thermometer' },
        { cells: [33, 25, 34], type: 'thermometer' }, { cells: [79, 69, 60], type: 'thermometer' }, { cells: [69, 60, 61], type: 'thermometer' },
        { cells: [13, 12, 2], type: 'thermometer' }, { cells: [33, 42, 52], type: 'thermometer' }, { cells: [10, 20, 30], type: 'thermometer' },
        { cells: [17, 16, 8], type: 'thermometer' }, { cells: [66, 74, 75], type: 'thermometer' }, { cells: [60, 52, 62], type: 'thermometer' },
        { cells: [0, 1, 9], type: 'thermometer' }, { cells: [31, 30, 29], type: 'thermometer' }, { cells: [70, 69, 78], type: 'thermometer' },
        { cells: [49, 41, 50], type: 'thermometer' }, { cells: [58, 68, 67], type: 'thermometer' }, { cells: [27, 28, 19], type: 'thermometer' },
        { cells: [14, 6, 15], type: 'thermometer' }, { cells: [42, 51, 41], type: 'thermometer' }, { cells: [26, 35, 44], type: 'thermometer' },
        { cells: [69, 59, 60], type: 'thermometer' }, { cells: [25, 35, 43], type: 'thermometer' }, { cells: [70, 80, 71], type: 'thermometer' },
        { cells: [36, 45, 37], type: 'thermometer' }, { cells: [53, 62, 61], type: 'thermometer' }, { cells: [11, 12, 4], type: 'thermometer' },
        { cells: [66, 76, 68], type: 'thermometer' }, { cells: [64, 54, 63], type: 'thermometer' }, { cells: [17, 7, 6], type: 'thermometer' },
      ] },
      { givens: EMPTY, rules: [
        { cells: [9, 10, 1], type: 'thermometer' }, { cells: [29, 30, 40], type: 'thermometer' }, { cells: [68, 67, 57], type: 'thermometer' },
        { cells: [38, 30, 31], type: 'thermometer' }, { cells: [71, 70, 78], type: 'thermometer' }, { cells: [20, 10, 1], type: 'thermometer' },
        { cells: [33, 41, 49], type: 'thermometer' }, { cells: [44, 52, 61], type: 'thermometer' }, { cells: [33, 32, 31], type: 'thermometer' },
        { cells: [48, 57, 66], type: 'thermometer' }, { cells: [56, 47, 57], type: 'thermometer' }, { cells: [7, 16, 26], type: 'thermometer' },
        { cells: [15, 16, 26], type: 'thermometer' }, { cells: [76, 68, 69], type: 'thermometer' }, { cells: [44, 34, 25], type: 'thermometer' },
        { cells: [19, 27, 36], type: 'thermometer' }, { cells: [32, 22, 31], type: 'thermometer' }, { cells: [8, 7, 16], type: 'thermometer' },
        { cells: [48, 56, 65], type: 'thermometer' }, { cells: [45, 37, 46], type: 'thermometer' }, { cells: [32, 42, 51], type: 'thermometer' },
        { cells: [58, 49, 40], type: 'thermometer' }, { cells: [4, 14, 24], type: 'thermometer' }, { cells: [18, 28, 27], type: 'thermometer' },
        { cells: [25, 16, 17], type: 'thermometer' }, { cells: [55, 46, 36], type: 'thermometer' }, { cells: [50, 60, 61], type: 'thermometer' },
        { cells: [4, 13, 3], type: 'thermometer' }, { cells: [54, 64, 55], type: 'thermometer' }, { cells: [43, 44, 35], type: 'thermometer' },
        { cells: [12, 22, 31], type: 'thermometer' }, { cells: [11, 21, 31], type: 'thermometer' }, { cells: [58, 67, 59], type: 'thermometer' },
        { cells: [30, 39, 31], type: 'thermometer' }, { cells: [62, 52, 61], type: 'thermometer' }, { cells: [75, 76, 66], type: 'thermometer' },
        { cells: [15, 14, 6], type: 'thermometer' }, { cells: [4, 13, 5], type: 'thermometer' }, { cells: [15, 24, 23], type: 'thermometer' },
        { cells: [55, 65, 74], type: 'thermometer' }, { cells: [79, 70, 60], type: 'thermometer' }, { cells: [18, 9, 0], type: 'thermometer' },
        { cells: [2, 10, 1], type: 'thermometer' }, { cells: [54, 64, 72], type: 'thermometer' }, { cells: [44, 53, 52], type: 'thermometer' },
        { cells: [71, 79, 80], type: 'thermometer' },
      ] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        { cells: [31, 23, 24], type: 'thermometer' }, { cells: [30, 22, 13], type: 'thermometer' }, { cells: [28, 37, 27], type: 'thermometer' },
        { cells: [7, 17, 26], type: 'thermometer' }, { cells: [5, 13, 4], type: 'thermometer' }, { cells: [62, 52, 44], type: 'thermometer' },
        { cells: [43, 42, 50], type: 'thermometer' }, { cells: [62, 53, 61], type: 'thermometer' }, { cells: [42, 41, 40], type: 'thermometer' },
        { cells: [71, 62, 61], type: 'thermometer' }, { cells: [16, 8, 17], type: 'thermometer' }, { cells: [20, 19, 10], type: 'thermometer' },
        { cells: [21, 31, 32], type: 'thermometer' }, { cells: [11, 20, 10], type: 'thermometer' }, { cells: [46, 55, 47], type: 'thermometer' },
        { cells: [49, 39, 38], type: 'thermometer' }, { cells: [73, 64, 72], type: 'thermometer' }, { cells: [23, 24, 34], type: 'thermometer' },
        { cells: [76, 67, 75], type: 'thermometer' }, { cells: [6, 16, 15], type: 'thermometer' }, { cells: [69, 79, 70, 78], type: 'thermometer' },
        { cells: [36, 28, 37], type: 'thermometer' }, { cells: [45, 37, 47], type: 'thermometer' }, { cells: [69, 70, 60], type: 'thermometer' },
        { cells: [48, 57, 56], type: 'thermometer' }, { cells: [9, 18, 10], type: 'thermometer' }, { cells: [35, 43, 53, 52, 61], type: 'thermometer' },
        { cells: [68, 77, 67], type: 'thermometer' }, { cells: [65, 74, 75], type: 'thermometer' }, { cells: [69, 79, 70], type: 'thermometer' },
        { cells: [71, 80, 70], type: 'thermometer' }, { cells: [65, 56, 66], type: 'thermometer' }, { cells: [59, 68, 77], type: 'thermometer' },
        { cells: [69, 70, 78], type: 'thermometer' }, { cells: [30, 29, 37], type: 'thermometer' }, { cells: [54, 45, 37], type: 'thermometer' },
        { cells: [42, 51, 52], type: 'thermometer' }, { cells: [3, 2, 12], type: 'thermometer' }, { cells: [49, 40, 50], type: 'thermometer' },
        { cells: [9, 0, 1], type: 'thermometer' }, { cells: [35, 43, 52], type: 'thermometer' }, { cells: [6, 5, 13, 4], type: 'thermometer' },
        { cells: [49, 58, 68, 67], type: 'thermometer' },
      ] },
      { givens: EMPTY, rules: [
        { cells: [42, 41, 40], type: 'thermometer' }, { cells: [28, 37, 27], type: 'thermometer' }, { cells: [76, 66, 75], type: 'thermometer' },
        { cells: [62, 52, 44], type: 'thermometer' }, { cells: [22, 13, 12], type: 'thermometer' }, { cells: [49, 39, 38], type: 'thermometer' },
        { cells: [3, 2, 12], type: 'thermometer' }, { cells: [6, 16, 15], type: 'thermometer' }, { cells: [71, 62, 70], type: 'thermometer' },
        { cells: [71, 62, 61], type: 'thermometer' }, { cells: [59, 68, 77], type: 'thermometer' }, { cells: [54, 45, 37], type: 'thermometer' },
        { cells: [20, 19, 10], type: 'thermometer' }, { cells: [68, 77, 67], type: 'thermometer' }, { cells: [42, 51, 52], type: 'thermometer' },
        { cells: [48, 57, 56], type: 'thermometer' }, { cells: [65, 56, 66], type: 'thermometer' }, { cells: [69, 70, 78], type: 'thermometer' },
        { cells: [49, 40, 50], type: 'thermometer' }, { cells: [7, 17, 26], type: 'thermometer' }, { cells: [30, 22, 13], type: 'thermometer' },
        { cells: [31, 23, 24], type: 'thermometer' }, { cells: [45, 37, 47], type: 'thermometer' }, { cells: [69, 70, 60], type: 'thermometer' },
        { cells: [21, 31, 32], type: 'thermometer' }, { cells: [36, 28, 37], type: 'thermometer' }, { cells: [30, 29, 37], type: 'thermometer' },
        { cells: [43, 42, 50], type: 'thermometer' }, { cells: [46, 55, 47], type: 'thermometer' }, { cells: [11, 20, 10], type: 'thermometer' },
        { cells: [9, 18, 10], type: 'thermometer' }, { cells: [73, 72, 63], type: 'thermometer' }, { cells: [23, 24, 34], type: 'thermometer' },
        { cells: [9, 0, 1], type: 'thermometer' }, { cells: [5, 13, 4], type: 'thermometer' }, { cells: [16, 8, 17], type: 'thermometer' },
        { cells: [65, 74, 75], type: 'thermometer' }, { cells: [14, 23, 32], type: 'thermometer' }, { cells: [73, 64, 72], type: 'thermometer' },
        { cells: [62, 53, 61], type: 'thermometer' }, { cells: [69, 79, 70], type: 'thermometer' }, { cells: [71, 80, 70], type: 'thermometer' },
        { cells: [35, 43, 52], type: 'thermometer' },
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        { cells: [9, 10, 1], type: 'thermometer' }, { cells: [29, 30, 40], type: 'thermometer' }, { cells: [68, 67, 57], type: 'thermometer' },
        { cells: [38, 30, 31], type: 'thermometer' }, { cells: [71, 70, 78], type: 'thermometer' }, { cells: [20, 10, 1], type: 'thermometer' },
        { cells: [33, 41, 49], type: 'thermometer' }, { cells: [44, 52, 61], type: 'thermometer' }, { cells: [33, 32, 31], type: 'thermometer' },
        { cells: [48, 57, 66], type: 'thermometer' }, { cells: [56, 47, 57], type: 'thermometer' }, { cells: [7, 16, 26], type: 'thermometer' },
        { cells: [15, 16, 26], type: 'thermometer' }, { cells: [76, 68, 69], type: 'thermometer' }, { cells: [44, 34, 25], type: 'thermometer' },
        { cells: [19, 27, 36], type: 'thermometer' }, { cells: [32, 22, 31], type: 'thermometer' }, { cells: [8, 7, 16], type: 'thermometer' },
        { cells: [48, 56, 65], type: 'thermometer' }, { cells: [45, 37, 46], type: 'thermometer' }, { cells: [58, 49, 40], type: 'thermometer' },
        { cells: [4, 14, 24], type: 'thermometer' }, { cells: [18, 28, 27], type: 'thermometer' }, { cells: [25, 16, 17], type: 'thermometer' },
        { cells: [55, 46, 36], type: 'thermometer' }, { cells: [50, 60, 61], type: 'thermometer' }, { cells: [4, 13, 3], type: 'thermometer' },
        { cells: [54, 64, 55], type: 'thermometer' }, { cells: [43, 44, 35], type: 'thermometer' }, { cells: [12, 22, 31], type: 'thermometer' },
        { cells: [11, 21, 31], type: 'thermometer' }, { cells: [58, 67, 59], type: 'thermometer' }, { cells: [30, 39, 31], type: 'thermometer' },
        { cells: [62, 52, 61], type: 'thermometer' }, { cells: [75, 76, 66], type: 'thermometer' }, { cells: [15, 14, 6], type: 'thermometer' },
        { cells: [4, 13, 5], type: 'thermometer' }, { cells: [15, 24, 23], type: 'thermometer' }, { cells: [55, 65, 74], type: 'thermometer' },
        { cells: [79, 70, 60], type: 'thermometer' }, { cells: [18, 9, 0], type: 'thermometer' }, { cells: [2, 10, 1], type: 'thermometer' },
        { cells: [54, 64, 72], type: 'thermometer' }, { cells: [44, 53, 52], type: 'thermometer' }, { cells: [71, 79, 80], type: 'thermometer' },
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        { cells: [0, 1, 11], type: 'thermometer' }, { cells: [15, 25, 17], type: 'thermometer' }, { cells: [15, 25, 35], type: 'thermometer' },
        { cells: [37, 29, 19], type: 'thermometer' }, { cells: [5, 4, 12], type: 'thermometer' }, { cells: [45, 55, 47], type: 'thermometer' },
        { cells: [29, 38, 28], type: 'thermometer' }, { cells: [56, 55, 65], type: 'thermometer' }, { cells: [5, 6, 7], type: 'thermometer' },
        { cells: [36, 27, 18], type: 'thermometer' }, { cells: [11, 19, 9], type: 'thermometer' }, { cells: [61, 69, 60], type: 'thermometer' },
        { cells: [15, 5, 14], type: 'thermometer' }, { cells: [56, 66, 58], type: 'thermometer' }, { cells: [56, 64, 74], type: 'thermometer' },
        { cells: [26, 34, 35], type: 'thermometer' }, { cells: [80, 70, 62], type: 'thermometer' }, { cells: [32, 22, 31], type: 'thermometer' },
        { cells: [21, 29, 30], type: 'thermometer' }, { cells: [73, 72, 64], type: 'thermometer' }, { cells: [76, 68, 69], type: 'thermometer' },
        { cells: [22, 31, 40], type: 'thermometer' }, { cells: [34, 33, 23], type: 'thermometer' }, { cells: [71, 79, 80], type: 'thermometer' },
        { cells: [42, 50, 59], type: 'thermometer' }, { cells: [42, 43, 35], type: 'thermometer' }, { cells: [42, 33, 41], type: 'thermometer' },
        { cells: [39, 48, 40], type: 'thermometer' }, { cells: [65, 57, 47], type: 'thermometer' }, { cells: [44, 43, 35], type: 'thermometer' },
        { cells: [54, 45, 55], type: 'thermometer' }, { cells: [1, 11, 2], type: 'thermometer' }, { cells: [22, 13, 3], type: 'thermometer' },
        { cells: [56, 48, 49], type: 'thermometer' }, { cells: [73, 64, 63], type: 'thermometer' }, { cells: [68, 77, 69], type: 'thermometer' },
        { cells: [78, 70, 62], type: 'thermometer' },
      ] },
      { givens: EMPTY, rules: [
        { cells: [66, 74, 75], type: 'thermometer' }, { cells: [79, 69, 60, 68, 77], type: 'thermometer' }, { cells: [74, 64, 65], type: 'thermometer' },
        { cells: [47, 38, 46], type: 'thermometer' }, { cells: [39, 48, 56], type: 'thermometer' }, { cells: [66, 76, 68], type: 'thermometer' },
        { cells: [42, 51, 41], type: 'thermometer' }, { cells: [18, 28, 37], type: 'thermometer' }, { cells: [23, 32, 24], type: 'thermometer' },
        { cells: [64, 54, 63], type: 'thermometer' }, { cells: [49, 57, 65], type: 'thermometer' }, { cells: [32, 31, 22], type: 'thermometer' },
        { cells: [73, 74, 64], type: 'thermometer' }, { cells: [26, 16, 15], type: 'thermometer' }, { cells: [0, 1, 9], type: 'thermometer' },
        { cells: [14, 6, 15], type: 'thermometer' }, { cells: [17, 16, 8], type: 'thermometer' }, { cells: [23, 32, 31, 41, 40], type: 'thermometer' },
        { cells: [70, 80, 71], type: 'thermometer' }, { cells: [33, 25, 34], type: 'thermometer' }, { cells: [49, 41, 50], type: 'thermometer' },
        { cells: [36, 45, 37], type: 'thermometer' }, { cells: [21, 20, 19], type: 'thermometer' }, { cells: [69, 60, 61], type: 'thermometer' },
        { cells: [70, 69, 78], type: 'thermometer' }, { cells: [41, 40, 30], type: 'thermometer' }, { cells: [60, 52, 62], type: 'thermometer' },
        { cells: [33, 42, 52], type: 'thermometer' }, { cells: [53, 62, 61], type: 'thermometer' }, { cells: [79, 69, 60], type: 'thermometer' },
        { cells: [58, 68, 67], type: 'thermometer' }, { cells: [25, 35, 43], type: 'thermometer' }, { cells: [69, 59, 60], type: 'thermometer' },
        { cells: [70, 69, 77], type: 'thermometer' }, { cells: [10, 20, 30], type: 'thermometer' }, { cells: [13, 12, 2], type: 'thermometer' },
        { cells: [27, 28, 19], type: 'thermometer' }, { cells: [26, 25, 34, 43], type: 'thermometer' },
      ] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [
        { cells: [9, 10, 1], type: 'thermometer' }, { cells: [29, 30, 40], type: 'thermometer' }, { cells: [68, 67, 57], type: 'thermometer' },
        { cells: [38, 30, 31], type: 'thermometer' }, { cells: [71, 70, 78], type: 'thermometer' }, { cells: [20, 10, 1], type: 'thermometer' },
        { cells: [33, 41, 49], type: 'thermometer' }, { cells: [44, 52, 61], type: 'thermometer' }, { cells: [33, 32, 31], type: 'thermometer' },
        { cells: [48, 57, 66], type: 'thermometer' }, { cells: [56, 47, 57], type: 'thermometer' }, { cells: [7, 16, 26], type: 'thermometer' },
        { cells: [15, 16, 26], type: 'thermometer' }, { cells: [76, 68, 69], type: 'thermometer' }, { cells: [44, 34, 25], type: 'thermometer' },
        { cells: [19, 27, 36], type: 'thermometer' }, { cells: [32, 22, 31], type: 'thermometer' }, { cells: [8, 7, 16], type: 'thermometer' },
        { cells: [48, 56, 65], type: 'thermometer' }, { cells: [45, 37, 46], type: 'thermometer' }, { cells: [58, 49, 40], type: 'thermometer' },
        { cells: [4, 14, 24], type: 'thermometer' }, { cells: [25, 16, 17], type: 'thermometer' }, { cells: [55, 46, 36], type: 'thermometer' },
        { cells: [50, 60, 61], type: 'thermometer' }, { cells: [4, 13, 3], type: 'thermometer' }, { cells: [54, 64, 55], type: 'thermometer' },
        { cells: [43, 44, 35], type: 'thermometer' }, { cells: [12, 22, 31], type: 'thermometer' }, { cells: [11, 21, 31], type: 'thermometer' },
        { cells: [58, 67, 59], type: 'thermometer' }, { cells: [30, 39, 31], type: 'thermometer' }, { cells: [62, 52, 61], type: 'thermometer' },
        { cells: [75, 76, 66], type: 'thermometer' }, { cells: [15, 14, 6], type: 'thermometer' }, { cells: [4, 13, 5], type: 'thermometer' },
        { cells: [15, 24, 23], type: 'thermometer' }, { cells: [55, 65, 74], type: 'thermometer' }, { cells: [79, 70, 60], type: 'thermometer' },
        { cells: [18, 9, 0], type: 'thermometer' }, { cells: [2, 10, 1], type: 'thermometer' }, { cells: [54, 64, 72], type: 'thermometer' },
        { cells: [44, 53, 52], type: 'thermometer' }, { cells: [71, 79, 80], type: 'thermometer' },
      ] },
    ],
    'impossible': [
      { givens: EMPTY, rules: [
        { cells: [54, 64, 72], type: 'thermometer' }, { cells: [4, 13, 5], type: 'thermometer' }, { cells: [75, 76, 66], type: 'thermometer' },
        { cells: [48, 56, 65], type: 'thermometer' }, { cells: [15, 24, 23], type: 'thermometer' }, { cells: [58, 67, 59], type: 'thermometer' },
        { cells: [4, 14, 24], type: 'thermometer' }, { cells: [62, 52, 61], type: 'thermometer' }, { cells: [45, 37, 46], type: 'thermometer' },
        { cells: [18, 28, 27], type: 'thermometer' }, { cells: [44, 53, 52], type: 'thermometer' }, { cells: [50, 60, 61], type: 'thermometer' },
        { cells: [32, 42, 51], type: 'thermometer' }, { cells: [18, 9, 0], type: 'thermometer' }, { cells: [44, 52, 61], type: 'thermometer' },
        { cells: [71, 70, 78], type: 'thermometer' }, { cells: [43, 44, 35], type: 'thermometer' }, { cells: [56, 47, 57], type: 'thermometer' },
        { cells: [54, 64, 55], type: 'thermometer' }, { cells: [58, 49, 40], type: 'thermometer' }, { cells: [9, 10, 1], type: 'thermometer' },
        { cells: [71, 79, 80], type: 'thermometer' }, { cells: [33, 32, 31], type: 'thermometer' }, { cells: [4, 13, 3], type: 'thermometer' },
        { cells: [79, 70, 60], type: 'thermometer' }, { cells: [55, 46, 36], type: 'thermometer' }, { cells: [29, 30, 40], type: 'thermometer' },
        { cells: [20, 10, 1], type: 'thermometer' }, { cells: [12, 22, 31], type: 'thermometer' }, { cells: [35, 26, 17], type: 'thermometer' },
        { cells: [15, 14, 6], type: 'thermometer' }, { cells: [25, 16, 17], type: 'thermometer' }, { cells: [30, 39, 31], type: 'thermometer' },
        { cells: [2, 10, 1], type: 'thermometer' }, { cells: [76, 68, 69], type: 'thermometer' }, { cells: [48, 57, 66], type: 'thermometer' },
        { cells: [19, 27, 36], type: 'thermometer' }, { cells: [33, 41, 49], type: 'thermometer' }, { cells: [7, 16, 26], type: 'thermometer' },
        { cells: [38, 30, 31], type: 'thermometer' }, { cells: [32, 22, 31], type: 'thermometer' }, { cells: [11, 21, 31], type: 'thermometer' },
        { cells: [44, 34, 25], type: 'thermometer' }, { cells: [55, 65, 74], type: 'thermometer' },
      ] },
    ],
  },
  'x-sum': {
    'hard': [
      { givens: EMPTY, rules: [
        xSum(4, 'south', 20), xSum(76, 'north', 1), xSum(80, 'north', 27),
        xSum(8, 'south', 45), xSum(26, 'west', 30), xSum(18, 'east', 39),
        xSum(72, 'east', 36), xSum(77, 'north', 45), xSum(5, 'south', 17),
        xSum(53, 'west', 21), xSum(45, 'east', 7), xSum(27, 'east', 33),
        xSum(35, 'west', 3), xSum(79, 'north', 21), xSum(7, 'south', 41),
        xSum(72, 'north', 39), xSum(0, 'south', 1), xSum(2, 'south', 37),
        xSum(74, 'north', 8), xSum(71, 'west', 6), xSum(63, 'east', 45),
        xSum(1, 'south', 33), xSum(73, 'north', 12), xSum(17, 'west', 1),
        xSum(9, 'east', 31), xSum(54, 'east', 16), xSum(62, 'west', 41),
        xSum(44, 'west', 33), xSum(36, 'east', 16), xSum(8, 'west', 45),
        xSum(0, 'east', 1), xSum(75, 'north', 40), xSum(3, 'south', 18),
      ] },
      { givens: EMPTY, rules: [
        xSum(4, 'south', 20), xSum(76, 'north', 1), xSum(80, 'north', 27),
        xSum(8, 'south', 45), xSum(26, 'west', 30), xSum(18, 'east', 39),
        xSum(72, 'east', 36), xSum(80, 'west', 25), xSum(77, 'north', 45),
        xSum(5, 'south', 17), xSum(53, 'west', 21), xSum(45, 'east', 7),
        xSum(27, 'east', 33), xSum(35, 'west', 3), xSum(79, 'north', 21),
        xSum(7, 'south', 41), xSum(72, 'north', 39), xSum(0, 'south', 1),
        xSum(2, 'south', 37), xSum(74, 'north', 8), xSum(71, 'west', 6),
        xSum(63, 'east', 45), xSum(1, 'south', 33), xSum(73, 'north', 12),
        xSum(17, 'west', 1), xSum(9, 'east', 31), xSum(54, 'east', 16),
        xSum(62, 'west', 41), xSum(44, 'west', 33), xSum(36, 'east', 16),
        xSum(8, 'west', 45), xSum(0, 'east', 1), xSum(75, 'north', 40),
        xSum(3, 'south', 18),
      ] },
    ],
    'very-hard': [
      { givens: EMPTY, rules: [
        xSum(75, 'north', 40), xSum(73, 'north', 12), xSum(76, 'north', 1),
        xSum(3, 'south', 18), xSum(63, 'east', 45), xSum(0, 'south', 1),
        xSum(53, 'west', 21), xSum(2, 'south', 37), xSum(36, 'east', 16),
        xSum(72, 'east', 36), xSum(79, 'north', 21), xSum(27, 'east', 33),
        xSum(1, 'south', 33), xSum(8, 'south', 45), xSum(5, 'south', 17),
        xSum(62, 'west', 41), xSum(18, 'east', 39), xSum(7, 'south', 41),
        xSum(72, 'north', 39), xSum(80, 'north', 27), xSum(74, 'north', 8),
        xSum(9, 'east', 31),
      ] },
    ],
    'expert': [
      { givens: EMPTY, rules: [
        xSum(76, 'north', 1), xSum(80, 'north', 27), xSum(8, 'south', 45),
        xSum(26, 'west', 30), xSum(18, 'east', 39), xSum(72, 'east', 36),
        xSum(5, 'south', 17), xSum(53, 'west', 21), xSum(27, 'east', 33),
        xSum(79, 'north', 21), xSum(7, 'south', 41), xSum(72, 'north', 39),
        xSum(0, 'south', 1), xSum(2, 'south', 37), xSum(63, 'east', 45),
        xSum(73, 'north', 12), xSum(62, 'west', 41), xSum(36, 'east', 16),
        xSum(75, 'north', 40), xSum(3, 'south', 18),
      ] },
    ],
    'master': [
      { givens: EMPTY, rules: [
        xSum(27, 'east', 33), xSum(79, 'north', 21), xSum(63, 'east', 45),
        xSum(7, 'south', 41), xSum(1, 'south', 33), xSum(75, 'north', 40),
        xSum(73, 'north', 12), xSum(5, 'south', 17), xSum(8, 'west', 45),
        xSum(80, 'north', 27), xSum(9, 'east', 31), xSum(3, 'south', 18),
        xSum(53, 'west', 21), xSum(0, 'east', 1), xSum(62, 'west', 41),
        xSum(2, 'south', 37), xSum(36, 'east', 16), xSum(72, 'east', 36),
        xSum(72, 'north', 39),
      ] },
      { givens: EMPTY, rules: [
        xSum(36, 'east', 16), xSum(53, 'west', 21), xSum(5, 'south', 17),
        xSum(2, 'south', 37), xSum(27, 'east', 33), xSum(9, 'east', 31),
        xSum(62, 'west', 41), xSum(8, 'south', 45), xSum(63, 'east', 45),
        xSum(75, 'north', 40), xSum(80, 'north', 27), xSum(72, 'north', 39),
        xSum(74, 'north', 8), xSum(7, 'south', 41), xSum(79, 'north', 21),
        xSum(1, 'south', 33), xSum(3, 'south', 18), xSum(72, 'east', 36),
        xSum(73, 'north', 12), xSum(8, 'west', 45),
      ] },
    ],
    'extreme': [
      { givens: EMPTY, rules: [
        xSum(2, 'south', 20), xSum(6, 'south', 14), xSum(9, 'east', 25),
        xSum(17, 'west', 45), xSum(71, 'west', 32), xSum(4, 'south', 45),
        xSum(7, 'south', 33), xSum(73, 'north', 45), xSum(45, 'east', 32),
        xSum(27, 'east', 33), xSum(62, 'west', 7), xSum(79, 'north', 17),
        xSum(72, 'east', 31), xSum(75, 'north', 43), xSum(77, 'north', 31),
        xSum(80, 'north', 17),
      ] },
      { givens: EMPTY, rules: [
        xSum(27, 'east', 33), xSum(7, 'south', 33), xSum(75, 'north', 43),
        xSum(62, 'west', 7), xSum(72, 'east', 31), xSum(35, 'west', 38),
        xSum(71, 'west', 32), xSum(2, 'south', 20), xSum(17, 'west', 45),
        xSum(4, 'south', 45), xSum(45, 'east', 32), xSum(73, 'north', 45),
        xSum(6, 'south', 14), xSum(9, 'east', 25), xSum(76, 'north', 7),
        xSum(53, 'west', 22),
      ] },
    ],
  },
}
