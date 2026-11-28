import type { CustomDifficulty } from './custom-modes.ts'
import type { VariantRule } from './engine.ts'
import { clueDelta } from './outside-clues.ts'

type Construction = { givens: string; regions?: string; rules?: readonly VariantRule[] }
export type VariantConstructionBank = Readonly<Record<string, Partial<Record<CustomDifficulty, readonly Construction[]>>>>

function killer(parts: readonly (readonly [sum: number, ...cells: number[]])[]): VariantRule {
  return { type: 'killer-cages', coverGrid: true, cages: parts.map(([sum, ...cells]) => ({ sum, cells })) }
}

function xSum(first: number, direction: Extract<VariantRule, { type: 'x-sum' }>['direction'], sum: number): VariantRule {
  const [row, column] = clueDelta(direction)
  const cells = Array.from({ length: 9 }, (_, offset) => first + offset * (9 * row + column))
  return { type: 'x-sum', cells, direction, sum }
}

function skyscraper(first: number, direction: Extract<VariantRule, { type: 'skyscrapers' }>['direction'], count: number): VariantRule {
  const [row, column] = clueDelta(direction)
  const cells = Array.from({ length: 9 }, (_, offset) => first + offset * (9 * row + column))
  return { type: 'skyscrapers', cells, direction, count }
}

function arrows(paths: readonly (readonly [number, ...number[]])[]): VariantRule[] {
  return paths.map(([circle, ...cells]) => ({ type: 'arrow', circle, cells }))
}

const chess: readonly VariantRule[] = [{ type: 'anti-knight' }, { type: 'anti-king' }, { type: 'non-consecutive' }]

// Reproducible starting layouts for grades that are costly to find by carving.
// Generation rechecks uniqueness, difficulty, rule evidence and play history.
export const checkedVariantPuzzles: VariantConstructionBank = {
  'adjacent-total': {
    'extreme': [
      { givens: '000000000090050001408010000060000090000001080000860500000000700050000400080000600', rules: [{ cells: [4, 5], sum: 9, type: 'adjacent-total' }, { cells: [63, 64], sum: 8, type: 'adjacent-total' }, { cells: [77, 78], sum: 15, type: 'adjacent-total' }, { cells: [52, 61], sum: 6, type: 'adjacent-total' }, { cells: [0, 1], sum: 7, type: 'adjacent-total' }] },
      { givens: '950040008000600500640000010000400000000003709000980000030000106070000000000009050', rules: [{ cells: [54, 63], sum: 7, type: 'adjacent-total' }, { cells: [38, 47], sum: 9, type: 'adjacent-total' }, { cells: [3, 4], sum: 6, type: 'adjacent-total' }, { cells: [10, 19], sum: 6, type: 'adjacent-total' }, { cells: [70, 79], sum: 9, type: 'adjacent-total' }] },
    ],
    'impossible': [
      { givens: '000000001000002000004050600006000010040007002500040800009300000060080900805700040', rules: [{ cells: [15, 16], sum: 7, type: 'adjacent-total' }] },
      { givens: '000000001000002030000530600007000060060020008400690700040900500709000000506203070', rules: [{ cells: [20, 21], sum: 9, type: 'adjacent-total' }] },
    ],
  },
  'adjacent-total,non-consecutive': {
    'medium': [
      { givens: '000000000000000000000000000008094710900130200003000400000000900000000000060000030', rules: [{ type: 'non-consecutive' }, { cells: [29, 30], sum: 14, type: 'adjacent-total' }, { cells: [65, 66], sum: 8, type: 'adjacent-total' }, { cells: [6, 7], sum: 13, type: 'adjacent-total' }, { cells: [77, 78], sum: 6, type: 'adjacent-total' }, { cells: [28, 37], sum: 6, type: 'adjacent-total' }] },
      { givens: '000000000000000200000570800000000000000000000900000000009008000080690700000007008', rules: [{ type: 'non-consecutive' }, { cells: [39, 48], sum: 9, type: 'adjacent-total' }, { cells: [72, 73], sum: 8, type: 'adjacent-total' }, { cells: [56, 65], sum: 13, type: 'adjacent-total' }, { cells: [2, 3], sum: 8, type: 'adjacent-total' }, { cells: [9, 18], sum: 14, type: 'adjacent-total' }] },
    ],
  },
  'anti-king,anti-knight,non-consecutive': {
    'beginner': [
      { givens: '174000000520100030903500070417900020052400000390000010741300050205000090039200040', rules: chess },
      { givens: '174000000520100030903500070407900020052400000390000010741300050205700090039200040', rules: chess },
      { givens: '174000000520100030903500000417900020052400000390000010741300050205700090039200040', rules: chess },
      { givens: '174000000520100030903500070417900020052400000390000010741300050205700090039200040', rules: chess },
    ],
    'easy': [
      { givens: '072615900605940072940072615706159400159400726400726159000000000000000000000000000', rules: chess },
      { givens: '072615040610940002940072615726159400159400726400726159000000000000000000000000000', rules: chess },
      { givens: '072610900615940070940072615726159400159400726400726159000000000000000000000000000', rules: chess },
      { givens: '072615900610940072940072615726159400159400726400726159000000000000000000000000000', rules: chess },
    ],
    'medium': [
      { givens: '000000000000000390000000000000030080000000030000000100000060000000000003006000007', rules: chess },
      { givens: '000000000000000300009000000000030000000000630003020170000000000000000003000000000', rules: chess },
      { givens: '000000000000000390009000000000030000000000030003000100000000000000000003006000007', rules: chess },
      { givens: '000000000000000096009000001000030000000000000003000100000000000000000000006000017', rules: chess },
    ],
    'tricky': [
      { givens: '000000000000000000000000800008000000000000000000000000000006000000000003000000000', rules: chess },
      { givens: '000000000000000000000000000000000000300000000010000002000006000000000000000000000', rules: chess },
      { givens: '000000000000000000000000000040000000000000000000000000000006000000000000000000700', rules: chess },
    ],
    'hard': [
      { givens: '000000000000800000000000800000000000000000001000000000000000000000000000000000700', rules: chess },
      { givens: '800000000000000000000000000000000000000000001000600000008000000002000000000000000', rules: chess },
      { givens: '800000000000000000000000000000000000000000001000000000000000000000000000000000708', rules: chess },
    ],
    'very-hard': [
      { givens: '100080000000000150000000000000000060000000500000000000000000000000000000000000000', rules: chess },
      { givens: '000080006000020050000000000000000060000000090000000000000000000000000000000000000', rules: chess },
      { givens: '000000000000706050000000400000000060000000000000000000000000000000000000000000000', rules: chess },
      { givens: '000000000000006150000000000000000001800000500000000000900000000000000000000000000', rules: chess },
    ],
    'expert': [
      { givens: '069000000000000000000020000000000000000000000040000000000000000008000000000000000', rules: chess },
      { givens: '009000000000000000000000009000000000000000400000000000000100000008000000000000000', rules: chess },
      { givens: '000000000005000000000000300000000000000000400000080000000000000000000000010000000', rules: chess },
      { givens: '009000000000000000000020000000000020000000400000000000000000000008000000000000000', rules: chess },
    ],
    'master': [
      { givens: '000000000000000800000000000000000000000000000000090000000000000000080000300000007', rules: chess },
      { givens: '000000000000000800000000000000000000000000000000000000050000000000080000000000007', rules: chess },
      { givens: '000000000000000800000000000000000000000000000000000000001000000000000000380000007', rules: chess },
      { givens: '000000000000000800000000000000000000000000000000000000000007000000080000300000000', rules: chess },
    ],
    'extreme': [
      { givens: '000000000000600000000000000000000000000900000000000060000800000000000000000001000', rules: chess },
      { givens: '000000000000600000000000000000000000000000000000400000000800000000000000000001006', rules: chess },
      { givens: '000000000000600000000000000000000000000000000000000000000800000000300000000000006', rules: chess },
      { givens: '000200000000600000000000000000000000000000000000000000000800000000000000000001000', rules: chess },
    ],
    'impossible': [
      { givens: '000000000000000000000000000000500000090100000000000000004000000000000000000000000', rules: chess },
      { givens: '000000000000000000000000000000000000090000000000000000000000000000000000020060700', rules: chess },
    ],
  },
  'anti-knight': {
    'impossible': [
      { givens: '000300000000700000000000009000000000000050020700000000000801570000070300000003060', rules: [{ type: 'anti-knight' }] },
      { givens: '000300000000700000000000009000000000000057020700000000000801570000070300000003060', rules: [{ type: 'anti-knight' }] },
    ],
  },
  'anti-knight,diagonal-main': {
    'master': [
      { givens: '000000000000000000000008205090000000800500000000986000000000000000210700907050300', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'anti-knight' }] },
      { givens: '000000000000000000000008205000000030800500000000086000000000000000210000907000300', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'anti-knight' }] },
    ],
    'extreme': [
      { givens: '000400080007000000640000010204080130000100000800000090000004000000000000000001000', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'anti-knight' }] },
      { givens: '000400080007000000600000010204080130000100000800000090000004000000000000000001000', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'anti-knight' }] },
    ],
    'impossible': [
      { givens: '000400080007000000600000010204080130000100000800000090000000000000000000000001000', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'anti-knight' }] },
      { givens: '000400080007000000600000010204080130000100000000007090000000000000000000000001000', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'anti-knight' }] },
    ],
  },
  'anti-knight,sandwich': {
    'medium': [
      { givens: '400000009300000000900426030704200986632009000890604200070040600200000000000060000', rules: [{ type: 'anti-knight' }, { cells: [35, 34, 33, 32, 31, 30, 29, 28, 27], direction: 'west', sum: 0, type: 'sandwich' }] },
      { givens: '000040000500300004080025006000200701000060000000000002002010050007602840050030007', rules: [{ type: 'anti-knight' }, { cells: [74, 65, 56, 47, 38, 29, 20, 11, 2], direction: 'north', sum: 0, type: 'sandwich' }] },
    ],
  },
  'arrow': {
    'impossible': [
      { givens: '000000001000000020003040500006003000050067300300810006005700090074100000600054700', rules: [{ cells: [13, 23], circle: 5, type: 'arrow' }] },
      { givens: '000000001000002340003010520002000005060000070070600000005001004010800900800090000', rules: [{ cells: [32, 40], circle: 31, type: 'arrow' }] },
    ],
  },
  'arrow,jigsaw': {
    'impossible': [
      { givens: '000000001000023040005600000008000009000008600650900000007500800020004000500010030', regions: '000112222000111122300111222303344555333444555334444555666777888666777888666777888', rules: arrows([
        [37, 38, 28],
      ]) },
    ],
  },
  'arrow,kropki,xv/negative=kropki-white,xv-ten': {
    'easy': [
      { givens: '000000000005000000000000050000005000000000500500000000000500000000000005050000000', rules: [{ consecutive: { negative: true, pairs: [[1, 2], [3, 12], [4, 5], [10, 11], [10, 19], [23, 32], [24, 25], [27, 36], [28, 29], [30, 31], [37, 38], [37, 46], [43, 44], [46, 47], [49, 50], [51, 60], [56, 57], [56, 65], [57, 58], [57, 66], [59, 60], [60, 61], [63, 72], [64, 73], [65, 66], [67, 76], [68, 69], [68, 77], [71, 80], [74, 75]] }, ratioTwo: { pairs: [[1, 2], [40, 41]] }, type: 'kropki' }, { five: { pairs: [[27, 28], [51, 52], [66, 67], [59, 60]] }, ten: { negative: true, pairs: [[5, 6], [7, 16], [8, 17], [9, 10], [12, 21], [14, 15], [19, 20], [23, 24], [26, 35], [34, 43], [38, 39], [47, 56], [50, 51], [53, 62], [61, 70], [69, 78], [77, 78], [79, 80]] }, type: 'xv' }, { cells: [23, 32], circle: 15, type: 'arrow' }, { cells: [34, 24], circle: 35, type: 'arrow' }, { cells: [14, 4], circle: 5, type: 'arrow' }] },
      { givens: '000050000000000000000000050000005000000000500500000000000500000000000005050000000', rules: [{ consecutive: { negative: true, pairs: [[1, 2], [3, 12], [4, 5], [10, 11], [10, 19], [23, 32], [24, 25], [27, 36], [28, 29], [30, 31], [37, 38], [37, 46], [43, 44], [46, 47], [49, 50], [51, 60], [56, 57], [56, 65], [57, 58], [57, 66], [59, 60], [60, 61], [63, 72], [64, 73], [65, 66], [67, 76], [68, 69], [68, 77], [71, 80], [74, 75]] }, ratioTwo: { pairs: [[1, 2], [40, 41]] }, type: 'kropki' }, { five: { pairs: [[27, 28], [51, 52], [66, 67], [59, 60]] }, ten: { negative: true, pairs: [[5, 6], [7, 16], [8, 17], [9, 10], [12, 21], [14, 15], [19, 20], [23, 24], [26, 35], [34, 43], [38, 39], [47, 56], [50, 51], [53, 62], [61, 70], [69, 78], [77, 78], [79, 80]] }, type: 'xv' }, { cells: [23, 32], circle: 15, type: 'arrow' }, { cells: [34, 24], circle: 35, type: 'arrow' }, { cells: [14, 4], circle: 5, type: 'arrow' }] },
      { givens: '000050000005000000000000050000005000000000500500000000000500000000000005050000000', rules: [{ consecutive: { negative: true, pairs: [[1, 2], [3, 12], [4, 5], [10, 11], [10, 19], [23, 32], [24, 25], [27, 36], [28, 29], [30, 31], [37, 38], [37, 46], [43, 44], [46, 47], [49, 50], [51, 60], [56, 57], [56, 65], [57, 58], [57, 66], [59, 60], [60, 61], [63, 72], [64, 73], [65, 66], [67, 76], [68, 69], [68, 77], [71, 80], [74, 75]] }, ratioTwo: { pairs: [[1, 2], [40, 41]] }, type: 'kropki' }, { five: { pairs: [[27, 28], [51, 52], [66, 67], [59, 60]] }, ten: { negative: true, pairs: [[5, 6], [7, 16], [8, 17], [9, 10], [12, 21], [14, 15], [19, 20], [23, 24], [26, 35], [34, 43], [38, 39], [47, 56], [50, 51], [53, 62], [61, 70], [69, 78], [77, 78], [79, 80]] }, type: 'xv' }, { cells: [23, 32], circle: 15, type: 'arrow' }, { cells: [34, 24], circle: 35, type: 'arrow' }, { cells: [14, 4], circle: 5, type: 'arrow' }] },
    ],
    'medium': [
      { givens: '000000000005000000000000000000000000000000000000000000000000000000000000050000000', rules: [{ consecutive: { negative: true, pairs: [[1, 2], [3, 12], [4, 5], [10, 11], [10, 19], [23, 32], [24, 25], [27, 36], [28, 29], [30, 31], [37, 38], [37, 46], [43, 44], [46, 47], [49, 50], [51, 60], [56, 57], [56, 65], [57, 58], [57, 66], [59, 60], [60, 61], [63, 72], [64, 73], [65, 66], [67, 76], [68, 69], [68, 77], [71, 80], [74, 75]] }, ratioTwo: { pairs: [[1, 2], [40, 41]] }, type: 'kropki' }, { five: { pairs: [[27, 28], [51, 52], [66, 67], [59, 60]] }, ten: { negative: true, pairs: [[5, 6], [7, 16], [8, 17], [9, 10], [12, 21], [14, 15], [19, 20], [23, 24], [26, 35], [34, 43], [38, 39], [47, 56], [50, 51], [53, 62], [61, 70], [69, 78], [77, 78], [79, 80]] }, type: 'xv' }, { cells: [23, 32], circle: 15, type: 'arrow' }, { cells: [34, 24], circle: 35, type: 'arrow' }, { cells: [14, 4], circle: 5, type: 'arrow' }] },
      { givens: '000000000000000000000000000000000000000000000000000000000000000000000005050000000', rules: [{ consecutive: { negative: true, pairs: [[1, 2], [3, 12], [4, 5], [10, 11], [10, 19], [23, 32], [24, 25], [27, 36], [28, 29], [30, 31], [37, 38], [37, 46], [43, 44], [46, 47], [49, 50], [51, 60], [56, 57], [56, 65], [57, 58], [57, 66], [59, 60], [60, 61], [63, 72], [64, 73], [65, 66], [67, 76], [68, 69], [68, 77], [71, 80], [74, 75]] }, ratioTwo: { pairs: [[1, 2], [40, 41]] }, type: 'kropki' }, { five: { pairs: [[27, 28], [51, 52], [66, 67], [59, 60]] }, ten: { negative: true, pairs: [[5, 6], [7, 16], [8, 17], [9, 10], [12, 21], [14, 15], [19, 20], [23, 24], [26, 35], [34, 43], [38, 39], [47, 56], [50, 51], [53, 62], [61, 70], [69, 78], [77, 78], [79, 80]] }, type: 'xv' }, { cells: [23, 32], circle: 15, type: 'arrow' }, { cells: [34, 24], circle: 35, type: 'arrow' }, { cells: [14, 4], circle: 5, type: 'arrow' }] },
      { givens: '000000000000000000000000000000000000000000000000000000000000000000000000050000000', rules: [{ consecutive: { negative: true, pairs: [[1, 2], [3, 12], [4, 5], [10, 11], [10, 19], [23, 32], [24, 25], [27, 36], [28, 29], [30, 31], [37, 38], [37, 46], [43, 44], [46, 47], [49, 50], [51, 60], [56, 57], [56, 65], [57, 58], [57, 66], [59, 60], [60, 61], [63, 72], [64, 73], [65, 66], [67, 76], [68, 69], [68, 77], [71, 80], [74, 75]] }, ratioTwo: { pairs: [[1, 2], [40, 41]] }, type: 'kropki' }, { five: { pairs: [[27, 28], [51, 52], [66, 67], [59, 60]] }, ten: { negative: true, pairs: [[5, 6], [7, 16], [8, 17], [9, 10], [12, 21], [14, 15], [19, 20], [23, 24], [26, 35], [34, 43], [38, 39], [47, 56], [50, 51], [53, 62], [61, 70], [69, 78], [77, 78], [79, 80]] }, type: 'xv' }, { cells: [23, 32], circle: 15, type: 'arrow' }, { cells: [34, 24], circle: 35, type: 'arrow' }, { cells: [14, 4], circle: 5, type: 'arrow' }] },
    ],
    'hard': [
      { givens: '000500000000000000000000000000000000000000000000000000000000000000000000000000001', rules: [{ consecutive: { negative: true, pairs: [[3, 4], [5, 14], [6, 15], [10, 11], [12, 13], [16, 17], [16, 25], [21, 22], [23, 24], [23, 32], [28, 37], [29, 30], [30, 31], [31, 32], [32, 33], [33, 42], [34, 43], [37, 38], [38, 47], [49, 50], [49, 58], [50, 59], [56, 57], [58, 59], [62, 71], [63, 72], [67, 68], [69, 70], [74, 75], [77, 78]] }, ratioTwo: { pairs: [[47, 56]] }, type: 'kropki' }, { five: { pairs: [[56, 57], [30, 31], [42, 51]] }, ten: { negative: true, pairs: [[0, 1], [7, 8], [13, 14], [19, 20], [20, 29], [22, 23], [22, 31], [45, 46], [46, 55], [51, 60], [52, 53], [52, 61], [55, 56], [63, 64], [65, 74], [67, 76]] }, type: 'xv' }, { cells: [49, 40], circle: 58, type: 'arrow' }, { cells: [51, 42], circle: 59, type: 'arrow' }, { cells: [7, 17], circle: 16, type: 'arrow' }] },
      { givens: '000500010000000000000000000000000000000000000000000000000000000000000000000000000', rules: [{ consecutive: { negative: true, pairs: [[3, 4], [5, 14], [6, 15], [10, 11], [12, 13], [16, 17], [16, 25], [21, 22], [23, 24], [23, 32], [28, 37], [29, 30], [30, 31], [31, 32], [32, 33], [33, 42], [34, 43], [37, 38], [38, 47], [49, 50], [49, 58], [50, 59], [56, 57], [58, 59], [62, 71], [63, 72], [67, 68], [69, 70], [74, 75], [77, 78]] }, ratioTwo: { pairs: [[47, 56]] }, type: 'kropki' }, { five: { pairs: [[56, 57], [30, 31], [42, 51]] }, ten: { negative: true, pairs: [[0, 1], [7, 8], [13, 14], [19, 20], [20, 29], [22, 23], [22, 31], [45, 46], [46, 55], [51, 60], [52, 53], [52, 61], [55, 56], [63, 64], [65, 74], [67, 76]] }, type: 'xv' }, { cells: [49, 40], circle: 58, type: 'arrow' }, { cells: [51, 42], circle: 59, type: 'arrow' }, { cells: [7, 17], circle: 16, type: 'arrow' }] },
      { givens: '000500000000000000000000000000000000000000000000000000000000000000000000000000000', rules: [{ consecutive: { negative: true, pairs: [[3, 4], [5, 14], [6, 15], [10, 11], [12, 13], [16, 17], [16, 25], [21, 22], [23, 24], [23, 32], [28, 37], [29, 30], [30, 31], [31, 32], [32, 33], [33, 42], [34, 43], [37, 38], [38, 47], [49, 50], [49, 58], [50, 59], [56, 57], [58, 59], [62, 71], [63, 72], [67, 68], [69, 70], [74, 75], [77, 78]] }, ratioTwo: { pairs: [[47, 56]] }, type: 'kropki' }, { five: { pairs: [[56, 57], [30, 31], [42, 51]] }, ten: { negative: true, pairs: [[0, 1], [7, 8], [13, 14], [19, 20], [20, 29], [22, 23], [22, 31], [45, 46], [46, 55], [51, 60], [52, 53], [52, 61], [55, 56], [63, 64], [65, 74], [67, 76]] }, type: 'xv' }, { cells: [49, 40], circle: 58, type: 'arrow' }, { cells: [51, 42], circle: 59, type: 'arrow' }, { cells: [7, 17], circle: 16, type: 'arrow' }] },
    ],
  },
  'arrow,windoku': {
    'master': [
      { givens: '050200000000000000710000000100000908200080000000000120007000000000400030000000000', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { cells: [13, 4], circle: 12, type: 'arrow' }, { cells: [66, 76], circle: 57, type: 'arrow' }, { cells: [69, 70], circle: 77, type: 'arrow' }] },
      { givens: '000107006803000000060000040000000000000000090004000000000000508000000000000050060', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { cells: [51, 60], circle: 59, type: 'arrow' }, { cells: [23, 22], circle: 24, type: 'arrow' }, { cells: [65, 57], circle: 56, type: 'arrow' }] },
    ],
    'extreme': [
      { givens: '500061000000000000200050600010007000005000000000040000900000400300400270001000000', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { cells: [25, 15], circle: 35, type: 'arrow' }, { cells: [41, 51], circle: 42, type: 'arrow' }, { cells: [1, 0], circle: 2, type: 'arrow' }] },
      { givens: '300000070000000000400000005804000790000900000000000000900050000070010050040000030', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { cells: [14, 6], circle: 23, type: 'arrow' }, { cells: [38, 48], circle: 37, type: 'arrow' }, { cells: [32, 22], circle: 40, type: 'arrow' }] },
    ],
    'impossible': [
      { givens: '002000056003000000700000000000000020000010000670000003000006570000000001000000000', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { cells: [51, 60], circle: 59, type: 'arrow' }, { cells: [23, 22], circle: 24, type: 'arrow' }, { cells: [65, 57], circle: 56, type: 'arrow' }] },
      { givens: '002000056003000000700000000000000020000010000670000003000026570000000001000000000', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { cells: [51, 60], circle: 59, type: 'arrow' }, { cells: [23, 22], circle: 24, type: 'arrow' }, { cells: [65, 57], circle: 56, type: 'arrow' }] },
    ],
  },
  'between': {
    'impossible': [
      { givens: '000001002003000040050060700000002010070050800400300000090000080500090006607000900', rules: [{ cells: [47, 57, 67], type: 'between' }] },
      { givens: '000000001001002000030040050000006702040050080600700000080000000904008030305090800', rules: [{ cells: [62, 53, 44], type: 'between' }] },
      { givens: '000000000002003040050060032000000400005020076060807000027000100036900000500070063', rules: [{ cells: [8, 7, 15], type: 'between' }] },
    ],
  },
  'between,non-consecutive': {
    'medium': [
      { givens: '000020006000100800000006000150000030000001000000000100000000000900000084000000020', rules: [{ type: 'non-consecutive' }, { cells: [22, 13, 4], type: 'between' }, { cells: [66, 76, 67], type: 'between' }, { cells: [57, 48, 56], type: 'between' }] },
    ],
  },
  'clone': {
    'impossible': [
      { givens: '000000001000002030004050670006000010000040500400800027007008000095000003600090700', rules: [{ groups: [[68, 37]], type: 'clone' }] },
      { givens: '000000001000002030004050600000001002040000078900070400070090500409000080506300000', rules: [{ groups: [[0, 29]], type: 'clone' }] },
      { givens: '000001002003000040050060700000002004007030500500800000076100000090600080300090600', rules: [{ groups: [[65, 80]], type: 'clone' }] },
    ],
  },
  'clone,non-consecutive': {
    'medium': [
      { givens: '000040000000005000000000004000090008028070900000000000009107000000000000010000630', rules: [{ type: 'non-consecutive' }, { groups: [[15, 0], [25, 33], [12, 71]], type: 'clone' }] },
      { givens: '500400003800000000300000008000500000000000000090020000050000001000003000000000800', rules: [{ type: 'non-consecutive' }, { groups: [[20, 51], [24, 57], [47, 17]], type: 'clone' }] },
    ],
  },
  'clone,sandwich': {
    'medium': [
      { givens: '002004030500082010000100002080000000600207804400009000100000209000970600000403100', rules: [{ groups: [[40, 35], [58, 74], [49, 55]], type: 'clone' }, { cells: [18, 19, 20, 21, 22, 23, 24, 25, 26], direction: 'east', sum: 11, type: 'sandwich' }] },
      { givens: '900000006000006090701900840000400020030002000006000000005008001000090260009300070', rules: [{ groups: [[58, 29], [37, 22], [4, 65]], type: 'clone' }, { cells: [17, 16, 15, 14, 13, 12, 11, 10, 9], direction: 'west', sum: 0, type: 'sandwich' }] },
    ],
  },
  'diagonal,non-consecutive': {
    'medium': [
      { givens: '000000000008000000090000000000000000000000000800957000301790000900460000604130000', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
      { givens: '420005030000060004000000000060000000000000000000906400000600000006000100000800300', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
    'tricky': [
      { givens: '000930000000000000002000000050070000000000500900000000000000000000040000000360008', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
      { givens: '009000000000305206000600814000000000000000000000000007000800000400000000000000000', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
    'hard': [
      { givens: '040290008000000000000000000850000000000000000000070000000009000020080600380000200', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
      { givens: '000000000070000903000000000060000800000000007040028030000000300000001000000000070', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
    'master': [
      { givens: '007900805000000000000014090000000000000000000030000000600000000005000030000000000', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
      { givens: '070000008000000000000002000000000100000090080008000000000000003300200000000006020', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
    'extreme': [
      { givens: '000000000000900000006000000000000005400000060005300000900100000000700601000000050', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
      { givens: '000800000000000000600300100280000000000150080000000900000000000000000049000000000', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
    'impossible': [
      { givens: '000702000000000000000000030000010000010000000050000000000000060006000000702000500', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
      { givens: '000080000070000030800100000000000060090800000000000000000000000305000009000000000', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
  },
  'diagonal,skyscrapers': {
    'medium': [
      { givens: '206418730100732000734965002023100070007003200000297003000000327075020000002070456', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, skyscraper(77, 'north', 3)] },
      { givens: '000950040009004005740360090093020004480095320007430609902573400350040970000209500', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, skyscraper(72, 'east', 4)] },
    ],
  },
  'diagonal,x-sum': {
    'medium': [
      { givens: '000950040009004005740360090090020004480090300007400009902073400350040970000209500', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, xSum(72, 'east', 1)] },
      { givens: '206418730100732000734965002023100070007003200000297003000000327075020000002070456', rules: [{ diagonal: 'main', type: 'diagonal' }, { diagonal: 'anti', type: 'diagonal' }, xSum(77, 'north', 1)] },
    ],
  },
  'diagonal-anti': {
    'impossible': [
      { givens: '009080000062000008000000072003800006000500000600209047900400005000000130020000060', rules: [{ diagonal: 'anti', type: 'diagonal' }] },
      { givens: '009080000062000008000000072003800006000506000600209047900400005000000130020000060', rules: [{ diagonal: 'anti', type: 'diagonal' }] },
    ],
  },
  'diagonal-main': {
    'extreme': [
      { givens: '409180053002090400005300000200800000000007080000419006700040090000508000020000000', rules: [{ diagonal: 'main', type: 'diagonal' }] },
      { givens: '000000600000108002000000003009000000047009050100003000000007100090030400050804090', rules: [{ diagonal: 'main', type: 'diagonal' }] },
    ],
    'impossible': [
      { givens: '000059000500000200000040105700000001003000004000000073200000000006200018008301900', rules: [{ diagonal: 'main', type: 'diagonal' }] },
      { givens: '000059000500000200000040100700000001003000004000000073200000000006200018008301900', rules: [{ diagonal: 'main', type: 'diagonal' }] },
    ],
  },
  'diagonal-main,non-consecutive': {
    'medium': [
      { givens: '008009000300000026900000108200900000000005001000000000000000000000204000000000000', rules: [{ diagonal: 'main', type: 'diagonal' }, { type: 'non-consecutive' }] },
    ],
  },
  'diagonal-main,sandwich': {
    'medium': [
      { givens: '810005070000107000000800910724683159081004230000000840102300000008070300390208060', rules: [{ diagonal: 'main', type: 'diagonal' }, { cells: [75, 66, 57, 48, 39, 30, 21, 12, 3], direction: 'north', sum: 21, type: 'sandwich' }] },
      { givens: '050000900100437020040005000000190065090000000470003092000600403000320600000708000', rules: [{ diagonal: 'main', type: 'diagonal' }, { cells: [53, 52, 51, 50, 49, 48, 47, 46, 45], direction: 'west', sum: 0, type: 'sandwich' }] },
    ],
  },
  'diagonal-main,skyscrapers': {
    'medium': [
      { givens: '000000002084019003009008050100000600000000040030000000693000104807003500500080000', rules: [{ diagonal: 'main', type: 'diagonal' }, skyscraper(78, 'north', 1)] },
      { givens: '000001076701083000050007140060000009070308001504200000020000004036070000005000000', rules: [{ diagonal: 'main', type: 'diagonal' }, skyscraper(79, 'north', 1)] },
    ],
  },
  'diagonal-main,x-sum': {
    'medium': [
      { givens: '000000002084019003009008050100000600000000040030000000693000104807003500500080000', rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(78, 'north', 45)] },
      { givens: '500000000070601800008000450810006000004000560003004000087000690006000000002000000', rules: [{ diagonal: 'main', type: 'diagonal' }, xSum(63, 'east', 1)] },
    ],
  },
  'dutch-whispers': {
    'impossible': [
      { givens: '000001002000030040005600307000806100080040020700900008050300009308000000907060000', rules: [{ cells: [69, 59, 58], minDifference: 4, type: 'whispers' }] },
      { givens: '000000001000002000004050260000700008005006040890000000002004300010000000700900050', rules: [{ cells: [14, 15, 16], minDifference: 4, type: 'whispers' }] },
    ],
  },
  'global-entropy': {
    'beginner': [
      { givens: '020593140063014800104628057600205900370000000040000005030462081000837209280000003', rules: [{ type: 'global-entropy' }] },
      { givens: '600004739080000200000000001276803914038000675901040008004006052060408107827900403', rules: [{ type: 'global-entropy' }] },
      { givens: '607240100104030000000681400000006040070504321000020605720063014048172500900058270', rules: [{ type: 'global-entropy' }] },
    ],
    'tricky': [
      { givens: '107200000000800000000000001508007203000900680000000000300108000002000000600720000', rules: [{ type: 'global-entropy' }] },
      { givens: '107240000000801000000006001008007203000900680000000000300108000002000000600720000', rules: [{ type: 'global-entropy' }] },
      { givens: '007200000000801000000006001008007203000900680000000000350108000002000000600020000', rules: [{ type: 'global-entropy' }] },
    ],
    'hard': [
      { givens: '000800450700600098000300000000000000040001000000420000060000000200000000400100000', rules: [{ type: 'global-entropy' }] },
      { givens: '003800450710000008000300000000009000040001000000420070060000000200000000000080000', rules: [{ type: 'global-entropy' }] },
      { givens: '000000450000602090000300060000000000040000000000420000960005003280000000000100000', rules: [{ type: 'global-entropy' }] },
    ],
    'very-hard': [
      { givens: '091000000300000000000000070240000030003500006075940028000000000960400010704080050', rules: [{ type: 'global-entropy' }] },
      { givens: '091000000350000200000000070200000030003000006075940028000000000960400000704080050', rules: [{ type: 'global-entropy' }] },
      { givens: '091000000300000000020000070200000030000500406075040028500000000968400010700080050', rules: [{ type: 'global-entropy' }] },
    ],
    'expert': [
      { givens: '000300000000000002000000007000000000001036080700008090000802370080010500070903010', rules: [{ type: 'global-entropy' }] },
      { givens: '000000008540680000030294000000020001400706200005100000000800000003010020200000000', rules: [{ type: 'global-entropy' }] },
    ],
    'master': [
      { givens: '090000800000000400000260000407900083000387000058000000000000069060000000502000000', rules: [{ type: 'global-entropy' }] },
      { givens: '001053000000000000080000000000000200000005000000029500300002005000008607000004300', rules: [{ type: 'global-entropy' }] },
    ],
    'extreme': [
      { givens: '300000068005000900000900000000000006000080000000006805003001000090007300040000791', rules: [{ type: 'global-entropy' }] },
      { givens: '000000268005000900000900000200009000000080000000406805000001000090007300040030701', rules: [{ type: 'global-entropy' }] },
      { givens: '300504008000028900000900000000000006000000000000006805003001000090007000040000791', rules: [{ type: 'global-entropy' }] },
    ],
    'impossible': [
      { givens: '310000060005000900000000000000000076000080000000006805703201000000007300040000090', rules: [{ type: 'global-entropy' }] },
      { givens: '300000068005000900000900000000000006000080000000006805003001000090007300040000790', rules: [{ type: 'global-entropy' }] },
    ],
  },
  'global-entropy,inequality': {
    'medium': [
      { givens: '000800100000000032000090470000050000000010080008073000094300008080709000000000300', rules: [{ type: 'global-entropy' }, { greater: 76, less: 67, type: 'inequality' }, { greater: 30, less: 21, type: 'inequality' }, { greater: 36, less: 37, type: 'inequality' }, { greater: 24, less: 23, type: 'inequality' }, { greater: 0, less: 1, type: 'inequality' }] },
      { givens: '500010000800400100000000900000020730000003005300000000083001500000007340000030000', rules: [{ type: 'global-entropy' }, { greater: 17, less: 26, type: 'inequality' }, { greater: 50, less: 41, type: 'inequality' }, { greater: 40, less: 31, type: 'inequality' }, { greater: 54, less: 45, type: 'inequality' }, { greater: 42, less: 51, type: 'inequality' }] },
    ],
  },
  'global-entropy,non-consecutive': {
    'medium': [
      { givens: '000000000000000000001000000500300800070900000000000000000030500000260000000000000', rules: [{ type: 'global-entropy' }, { type: 'non-consecutive' }] },
    ],
  },
  'global-entropy,skyscrapers': {
    'medium': [
      { givens: '020003070000000002036000000180500000300007000000002600000000000798001050000000700', rules: [{ type: 'global-entropy' }, skyscraper(0, 'south', 1)] },
      { givens: '020003070000000002036000000100500000300007000000002600000000000790001050005000700', rules: [{ type: 'global-entropy' }, skyscraper(0, 'south', 1)] },
    ],
  },
  'global-entropy,windoku': {
    'medium': [
      { givens: '900000804000300000017008003000010000001080000000000169000000020009003000106050000', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { type: 'global-entropy' }] },
      { givens: '010000030300000060000000000000000000700400006480000000000060007500080390000000000', rules: [{ cells: [10, 11, 12, 19, 20, 21, 28, 29, 30], type: 'extra-house' }, { cells: [14, 15, 16, 23, 24, 25, 32, 33, 34], type: 'extra-house' }, { cells: [46, 47, 48, 55, 56, 57, 64, 65, 66], type: 'extra-house' }, { cells: [50, 51, 52, 59, 60, 61, 68, 69, 70], type: 'extra-house' }, { type: 'global-entropy' }] },
    ],
  },
  'inequality': {
    'impossible': [
      { givens: '000000012000003004004000500006020005070006020800900600001060050090008000300700000', rules: [{ greater: 31, less: 22, type: 'inequality' }] },
      { givens: '000000001000002340004010250000670000005020003080030060003001005500080930970000000', rules: [{ greater: 42, less: 41, type: 'inequality' }] },
      { givens: '000000001000021034031400500000006700000090000067300010014500007800000000600004050', rules: [{ greater: 38, less: 39, type: 'inequality' }] },
    ],
  },
  'inequality,non-consecutive': {
    'medium': [
      { givens: '639000204000000000000000000000360000005000963900500020390200000000000000000000000', rules: [{ type: 'non-consecutive' }, { greater: 14, less: 5, type: 'inequality' }, { greater: 48, less: 57, type: 'inequality' }, { greater: 70, less: 79, type: 'inequality' }, { greater: 15, less: 6, type: 'inequality' }, { greater: 42, less: 43, type: 'inequality' }] },
      { givens: '000000000000000000000000000008094710900130200003000400000000900000060000060000030', rules: [{ type: 'non-consecutive' }, { greater: 29, less: 30, type: 'inequality' }, { greater: 75, less: 66, type: 'inequality' }, { greater: 6, less: 15, type: 'inequality' }, { greater: 78, less: 77, type: 'inequality' }, { greater: 29, less: 28, type: 'inequality' }] },
    ],
  },
  'jigsaw': {
    'beginner': [
      { givens: '010059040500000300030040125708060004001004003000000068906421800103900652207536491', regions: '888555222888554222878554122877544121777544111777344111666334000666333000666333000' },
      { givens: '010059040500000300030040105708060004001004003000000068906421800103900652207536491', regions: '888555222888554222878554122877544121777544111777344111666334000666333000666333000' },
    ],
    'easy': [
      { givens: '000607002001000030200105007694000873000003040000000000875090304000080006040000720', regions: '000111222000112222000111122334444445333444555333355555666777888666777788666778888' },
      { givens: '000607002001000030200105007694000873000000040000000000875090304000080006040000720', regions: '000111222000112222000111122334444445333444555333355555666777888666777788666778888' },
    ],
    'medium': [
      { givens: '005007000000490700070003006060000180504706302001200000000001853000000000000504600', regions: '000111222000112222030111122330444555333444555333444555666666888667677788777778888' },
      { givens: '005007000000490700070003006060000080504706302001200000000001853000000000000504600', regions: '000111222000112222030111122330444555333444555333444555666666888667677788777778888' },
    ],
    'tricky': [
      { givens: '030501208008000000000030000000002700700040100000100004503096000820004050601200030', regions: '000111222000112222030111122330444445333444555663455555663777888663777788666778888' },
      { givens: '405003000000600005900080560004070213700001400130000000087004030000300000006005008', regions: '000111222000112222000111122334444555333444555333344555666777888666777788666778888' },
    ],
    'hard': [
      { givens: '000000200000400005008160000500079060074000900006800057090500000000004002002087090', regions: '222555888222555888221555878121444778111444777111444777003333336000336666000036666' },
      { givens: '000000900080000030000053612670005200100000040500000000000089006400207053000000090', regions: '222555888222555888221555878121444678111444677111444667000033677003333667000333667' },
      { givens: '050000090000500107070020005045300000006900032000670800400000000517004069060005010', regions: '888877666887777666888777666555553333555444333544444433221111000222211000222111000' },
    ],
    'very-hard': [
      { givens: '037008000020600375000070000002000701006310040070024009000000000009030104765000020', regions: '666778888663777788663777888663455555333444555330444445030111122000112222000111222' },
      { givens: '000400000700500000210064000052803006809006010006040000000000200000000305590000100', regions: '888877666887777366888777366555444366555444333555444330221111300222211000222111000' },
      { givens: '007000200900000000000000004090100670001060020020500000000079460602013000000000050', regions: '000111222000112222030111122330444555333444555333444555666666888667677788777778888' },
    ],
    'expert': [
      { givens: '005400800000008300000570090170905004000006200000000000006240030000000940290053060', regions: '222111000222111000222111300555444330555444333555444363888777366887777666888877666' },
      { givens: '000000200000400005008160000500079060074000900006000057090500000000004002002087090', regions: '222555888222555888221555878121444778111444777111444777003333336000336666000036666' },
      { givens: '008950002700030500050100300002000400609480000000510000000067200000000004003000005', regions: '222111000222211000221111030544444033555444333555554366888777366887777366888877666' },
    ],
    'master': [
      { givens: '008950002700000500050100300002000400609480000000510000000067200000000004003000005', regions: '222111000222211000221111030544444033555444333555554366888777366887777366888877666' },
      { givens: '000400000700500000010064000052803006809006010006040000000000200000000305590000100', regions: '888877666887777366888777366555444366555444333555444330221111300222211000222111000' },
      { givens: '043060900890000200000500010700003000005100700010800009050000000000004000080000000', regions: '222111000222111000222111000555444433555444333555443333888776666887777666888877766' },
    ],
    'extreme': [
      { givens: '900080070580004003007003000000000000091700000000000200020000056000000940000605010', regions: '888555222888555222878555222877444111777444111776344111766334000666333000666333000' },
      { givens: '008950002700000500050100300002000400609080000000510000000067200000000004003000005', regions: '222111000222211000221111030544444033555444333555554366888777366887777366888877666' },
      { givens: '003000200002870000000320007130006005900510800000038000004000080000000000050100030', regions: '000111222000112222030111122330444555333444555333444555666666888667677788777778888' },
    ],
    'impossible': [
      { givens: '000000001000002340004010250002003005060070000800000000005001002090600000700080090', regions: '000111222000111222000111225333444255333444555633444558636777588666777888666777888' },
      { givens: '000001002000030040005600700008009060050000800670800000006900000080024030400000001', regions: '000111222000111222000111222333444555333444555633444558663777588666777888666777888' },
    ],
  },
  'killer-cages': {
    'tricky': [
      { givens: '080000007000000900000000000000300000000000000000000002000000000000070000006030009', rules: [killer([[9, 28, 29, 30], [35, 74, 73, 72, 63, 64, 65], [14, 38, 37], [5, 42, 41], [25, 20, 19, 18, 9, 10], [15, 48, 49], [17, 55, 54, 45], [17, 34, 35, 26, 25], [10, 50, 51], [6, 46, 47], [29, 71, 62, 61, 60, 59], [10, 36, 27], [40, 11, 12, 13, 14, 15, 16, 17], [5, 52, 53], [11, 40, 39], [21, 66, 67, 68, 69, 70], [45, 8, 7, 6, 5, 4, 3, 2, 1, 0], [12, 58, 57, 56], [30, 80, 79, 78, 77, 76, 75], [12, 44, 43], [19, 31, 32, 33], [18, 24, 23, 22, 21]])] },
      { givens: '000900000090030000000000000000000000900000000000000010060000000000000000030000070', rules: [killer([[13, 42, 41, 40], [31, 14, 15, 16, 17, 8, 7], [11, 26, 25], [12, 34, 35], [20, 57, 56, 55, 54, 45], [11, 22, 21], [39, 63, 64, 65, 66, 67, 68, 69], [6, 32, 33], [17, 36, 27], [27, 51, 52, 53, 44, 43], [6, 30, 31], [10, 39, 38, 37], [18, 20, 19, 18, 9], [13, 28, 29], [36, 6, 5, 4, 3, 2, 1, 0], [21, 10, 11, 12, 13], [28, 46, 47, 48, 49, 50], [45, 80, 79, 78, 77, 76, 75, 74, 73, 72], [7, 24, 23], [34, 70, 71, 62, 61, 60, 59, 58]])] },
      { givens: '000050000008000003000003000000000002000000001000007000000000000000400036000000000', rules: [killer([[18, 68, 59, 50], [32, 34, 25, 16, 7, 8, 17], [9, 4, 13], [40, 28, 19, 10, 1, 2, 11, 20], [6, 30, 21], [33, 63, 72, 73, 64, 55, 46, 37], [13, 12, 3], [32, 0, 9, 18, 27, 36, 45, 54], [18, 29, 38, 47, 56], [21, 5, 6, 15, 24, 33], [17, 41, 32, 23, 14], [24, 79, 70, 61, 52, 43], [15, 65, 74, 75], [16, 40, 49, 58], [11, 67, 76, 77], [13, 66, 57], [17, 22, 31], [26, 42, 51, 60, 69, 78], [10, 48, 39], [34, 26, 35, 44, 53, 62, 71, 80]])] },
    ],
    'hard': [
      { givens: '049006800008003000003000070002000700060000000000820000081354000000000040000000005', rules: [killer([[23, 66, 75, 76, 67], [26, 16, 25, 34, 43, 52], [18, 24, 15, 6, 7], [26, 21, 30, 39, 48, 57], [19, 22, 13, 4, 5], [27, 61, 70, 79, 80, 71], [45, 72, 63, 54, 45, 36, 27, 18, 9, 0], [12, 32, 41], [32, 62, 53, 44, 35, 26, 17, 8], [19, 58, 49, 40, 31], [29, 20, 11, 2, 3, 12], [45, 1, 10, 19, 28, 37, 46, 55, 64, 73], [12, 14, 23], [7, 50, 59, 68], [27, 60, 51, 42, 33], [13, 77, 78, 69], [25, 74, 65, 56, 47, 38, 29]])] },
      { givens: '080600300000000000000010002000000000006001000000030000020090700009400000000000000', rules: [killer([[8, 59, 50], [6, 41, 32], [30, 53, 62, 71, 80, 79], [14, 13, 22, 31], [33, 56, 65, 74, 73, 64, 55], [22, 34, 25, 16, 7], [26, 39, 30, 21, 12, 3], [12, 60, 69, 78], [27, 2, 11, 20, 29, 38, 47], [10, 77, 68], [16, 40, 49, 58], [17, 70, 61, 52, 43], [12, 23, 14], [14, 5, 4], [21, 8, 17, 26, 35, 44], [13, 33, 42, 51], [11, 67, 76, 75], [18, 66, 57, 48], [45, 0, 9, 18, 27, 36, 45, 54, 63, 72], [20, 6, 15, 24], [30, 46, 37, 28, 19, 10, 1]])] },
      { givens: '020000300008000070005000000000005000200000000003000090000090700000070004000060000', rules: [killer([[7, 24, 25, 26], [17, 6, 7, 8], [15, 75, 76, 77], [16, 29, 28, 27], [20, 42, 43, 44], [15, 71, 70, 69], [15, 54, 55, 56], [11, 35, 34, 33], [18, 32, 31, 30], [12, 65, 64, 63], [14, 53, 52, 51], [12, 14, 13, 12], [14, 47, 46, 45], [12, 57, 58, 59], [18, 21, 22, 23], [20, 18, 19, 20], [13, 0, 1, 2], [15, 36, 37, 38], [18, 68, 67, 66], [10, 39, 40, 41], [21, 17, 16, 15], [17, 50, 49, 48], [18, 72, 73, 74], [18, 60, 61, 62], [12, 78, 79, 80], [12, 11, 10, 9], [15, 3, 4, 5]])] },
    ],
    'extreme': [
      { givens: '040000000000000000007000000000000000080000000070000001000000000000000500000000000', rules: [killer([[11, 0, 1, 2], [15, 3, 4], [19, 5, 6, 7, 8], [10, 9, 10], [17, 11, 12, 13, 14], [18, 15, 16, 17], [19, 18, 19, 20, 21], [15, 22, 23], [11, 24, 25, 26], [15, 27, 28, 29, 30], [21, 31, 32, 33], [9, 34, 35], [11, 36, 37], [19, 38, 39, 40, 41], [15, 42, 43, 44], [22, 45, 46, 47, 48], [19, 49, 50, 51], [4, 52, 53], [8, 54, 55, 56], [14, 57, 58], [23, 59, 60, 61, 62], [17, 63, 64, 65], [19, 66, 67, 68, 69], [9, 70, 71], [22, 72, 73, 74, 75], [11, 76, 77, 78], [12, 79, 80]])] },
      { givens: '040000009000000000007000000000000000080000000070000000000000000000000500000000000', rules: [killer([[11, 0, 1, 2], [15, 3, 4], [19, 5, 6, 7, 8], [10, 9, 10], [17, 11, 12, 13, 14], [18, 15, 16, 17], [19, 18, 19, 20, 21], [15, 22, 23], [11, 24, 25, 26], [15, 27, 28, 29, 30], [21, 31, 32, 33], [9, 34, 35], [11, 36, 37], [19, 38, 39, 40, 41], [15, 42, 43, 44], [22, 45, 46, 47, 48], [19, 49, 50, 51], [4, 52, 53], [8, 54, 55, 56], [14, 57, 58], [23, 59, 60, 61, 62], [17, 63, 64, 65], [19, 66, 67, 68, 69], [9, 70, 71], [22, 72, 73, 74, 75], [11, 76, 77, 78], [12, 79, 80]])] },
      { givens: '040000000000000000007000000000000000080000000070000030000000000000000500000000000', rules: [killer([[11, 0, 1, 2], [15, 3, 4], [19, 5, 6, 7, 8], [10, 9, 10], [17, 11, 12, 13, 14], [18, 15, 16, 17], [19, 18, 19, 20, 21], [15, 22, 23], [11, 24, 25, 26], [15, 27, 28, 29, 30], [21, 31, 32, 33], [9, 34, 35], [11, 36, 37], [19, 38, 39, 40, 41], [15, 42, 43, 44], [22, 45, 46, 47, 48], [19, 49, 50, 51], [4, 52, 53], [8, 54, 55, 56], [14, 57, 58], [23, 59, 60, 61, 62], [17, 63, 64, 65], [19, 66, 67, 68, 69], [9, 70, 71], [22, 72, 73, 74, 75], [11, 76, 77, 78], [12, 79, 80]])] },
    ],
    'impossible': [
      { givens: '300601200600080000000000010000000000500000000000000000000000000000000000070000000', rules: [killer([[8, 60, 59, 58], [36, 29, 30, 31, 32, 33, 34], [15, 62, 61], [33, 9, 10, 11, 12, 13, 14, 15], [24, 36, 45, 46, 47], [20, 76, 75, 74, 73, 72], [21, 40, 39, 38, 37], [21, 35, 44, 43, 42, 41], [12, 52, 53], [39, 16, 17, 26, 25, 24, 23, 22], [45, 8, 7, 6, 5, 4, 3, 2, 1, 0], [25, 54, 63, 64, 65], [26, 71, 80, 79, 78, 77], [13, 57, 56, 55], [25, 21, 20, 19, 18, 27, 28], [14, 48, 49, 50, 51], [28, 66, 67, 68, 69, 70]])] },
      { givens: '000050000000000000000000000000000008040000100000000000000000000007900002000000000', rules: [killer([[21, 75, 66, 57, 48], [20, 5, 4, 13, 22, 31], [18, 46, 37, 28], [32, 51, 60, 69, 78, 77, 68], [23, 39, 30, 21, 12], [23, 19, 10, 1, 0, 9], [13, 3, 2, 11], [32, 59, 50, 41, 32, 23, 14], [10, 64, 55], [39, 16, 7, 6, 15, 24, 33, 42], [11, 38, 47], [13, 56, 65], [27, 40, 49, 58, 67, 76], [45, 8, 17, 26, 35, 44, 53, 62, 71, 80], [6, 20, 29], [37, 18, 27, 36, 45, 54, 63, 72], [5, 74, 73], [30, 79, 70, 61, 52, 43, 34, 25]])] },
      { givens: '000000000000000000000006020000000000000000000000000040000500000000000000750300600', rules: [killer([[5, 24, 25], [40, 56, 57, 58, 59, 60, 61, 62], [13, 22, 23], [39, 0, 1, 2, 3, 4, 5, 6], [45, 72, 73, 74, 75, 76, 77, 78, 79, 80], [15, 32, 31, 30], [21, 43, 44, 53, 52, 51, 50], [45, 71, 70, 69, 68, 67, 66, 65, 64, 63], [12, 13, 12, 11, 10], [29, 38, 39, 40, 41, 42], [11, 26, 35], [36, 49, 48, 47, 46, 45, 54, 55], [17, 9, 18, 19], [36, 7, 8, 17, 16, 15, 14], [5, 20, 21], [16, 34, 33], [20, 29, 28, 27, 36, 37]])] },
    ],
  },
  'killer-cages,non-consecutive': {
    'medium': [
      { givens: '005000000008000000000000000000000000000000010003000000000000000000000000000000007', rules: [{ type: 'non-consecutive' }, { cages: [{ cells: [0, 9, 18], sum: 16 }, { cells: [27, 36], sum: 14 }, { cells: [45, 54, 63, 72], sum: 15 }, { cells: [1, 10, 19, 28], sum: 16 }, { cells: [37, 46], sum: 14 }, { cells: [55, 64, 73], sum: 15 }, { cells: [2, 11, 20, 29], sum: 18 }, { cells: [38, 47, 56], sum: 19 }, { cells: [65, 74], sum: 8 }, { cells: [3, 12], sum: 10 }, { cells: [21, 30, 39, 48], sum: 22 }, { cells: [57, 66, 75], sum: 13 }, { cells: [4, 13, 22, 31], sum: 18 }, { cells: [40, 49, 58], sum: 16 }, { cells: [67, 76], sum: 11 }, { cells: [5, 14], sum: 14 }, { cells: [23, 32, 41], sum: 12 }, { cells: [50, 59, 68, 77], sum: 19 }, { cells: [6, 15, 24, 33], sum: 19 }, { cells: [42, 51, 60], sum: 16 }, { cells: [69, 78], sum: 10 }, { cells: [7, 16], sum: 11 }, { cells: [25, 34, 43, 52], sum: 17 }, { cells: [61, 70, 79], sum: 17 }, { cells: [8, 17, 26], sum: 15 }, { cells: [35, 44, 53, 62], sum: 19 }, { cells: [71, 80], sum: 11 }], coverGrid: true, type: 'killer-cages' }] },
      { givens: '000000000000000000000000050000000001000000000000000000000000000030000000000000000', rules: [{ type: 'non-consecutive' }, { cages: [{ cells: [0, 1], sum: 10 }, { cells: [2, 3, 4, 5], sum: 18 }, { cells: [6, 7, 8], sum: 17 }, { cells: [9, 10], sum: 10 }, { cells: [11, 12, 13], sum: 20 }, { cells: [14, 15, 16, 17], sum: 15 }, { cells: [18, 19], sum: 10 }, { cells: [20, 21, 22], sum: 14 }, { cells: [23, 24, 25, 26], sum: 21 }, { cells: [27, 28, 29], sum: 15 }, { cells: [30, 31], sum: 10 }, { cells: [32, 33, 34, 35], sum: 20 }, { cells: [36, 37], sum: 16 }, { cells: [38, 39, 40, 41], sum: 16 }, { cells: [42, 43, 44], sum: 13 }, { cells: [45, 46, 47, 48], sum: 14 }, { cells: [49, 50, 51], sum: 21 }, { cells: [52, 53], sum: 10 }, { cells: [54, 55, 56], sum: 15 }, { cells: [57, 58, 59, 60], sum: 21 }, { cells: [61, 62], sum: 9 }, { cells: [63, 64, 65], sum: 10 }, { cells: [66, 67, 68, 69], sum: 19 }, { cells: [70, 71], sum: 16 }, { cells: [72, 73], sum: 11 }, { cells: [74, 75, 76, 77], sum: 19 }, { cells: [78, 79, 80], sum: 15 }], coverGrid: true, type: 'killer-cages' }] },
    ],
  },
  'kropki': {
    'extreme': [
      { givens: '002300700930002000010004000000109000103020006489070000300000000004201000000000010', rules: [{ consecutive: { pairs: [[59, 60], [16, 17], [69, 78], [20, 29], [63, 72]] }, ratioTwo: { pairs: [[58, 67], [76, 77], [14, 15], [15, 24]] }, type: 'kropki' }] },
      { givens: '002300700930002000010004000000109000103000006489070000300000000004201000000000010', rules: [{ consecutive: { pairs: [[59, 60], [16, 17], [69, 78], [20, 29], [63, 72]] }, ratioTwo: { pairs: [[58, 67], [76, 77], [14, 15], [15, 24]] }, type: 'kropki' }] },
    ],
    'impossible': [
      { givens: '000000001000002340004010250000670000005020003080030060003001005500080930970000000', rules: [{ consecutive: { pairs: [[11, 12]] }, ratioTwo: { pairs: [[40, 41]] }, type: 'kropki' }] },
      { givens: '000000001000002340003010250000060000070000060506004032005001000002045003840900000', rules: [{ consecutive: { pairs: [[38, 39]] }, ratioTwo: { pairs: [[53, 62]] }, type: 'kropki' }] },
    ],
  },
  'kropki-black': {
    'impossible': [
      { givens: '000000001002003040050640700000000900008300020500020000004068010010400800085030060', rules: [{ consecutive: {  }, ratioTwo: { pairs: [[22, 31]] }, type: 'kropki' }] },
      { givens: '000000001000002340003010250000060000070000060506004032005001000002045003840900000', rules: [{ consecutive: {  }, ratioTwo: { pairs: [[53, 62]] }, type: 'kropki' }] },
    ],
  },
  'kropki-white': {
    'impossible': [
      { givens: '000000001002003000040050060000700008009560000070004050050300070900000002107040800', rules: [{ consecutive: { pairs: [[41, 42]] }, ratioTwo: {  }, type: 'kropki' }] },
      { givens: '000000001000021034031400500000006700000090000067300010014500007800000000600004050', rules: [{ consecutive: { pairs: [[38, 47]] }, ratioTwo: {  }, type: 'kropki' }] },
    ],
  },
  'little-killer': {
    'master': [
      { givens: '005200070806400000000080000010850020040003000600700309001006008000008004000000000', rules: [{ cells: [45, 55, 65, 75], direction: 'south-east', sum: 25, type: 'little-killer' }, { cells: [78, 70, 62], direction: 'north-east', sum: 18, type: 'little-killer' }, { cells: [45, 37, 29, 21, 13, 5], direction: 'north-east', sum: 26, type: 'little-killer' }, { cells: [53, 43, 33, 23, 13, 3], direction: 'north-west', sum: 33, type: 'little-killer' }] },
      { givens: '005200070806400000000080000010850020040000000600700309001006008000008004000000000', rules: [{ cells: [45, 55, 65, 75], direction: 'south-east', sum: 25, type: 'little-killer' }, { cells: [78, 70, 62], direction: 'north-east', sum: 18, type: 'little-killer' }, { cells: [45, 37, 29, 21, 13, 5], direction: 'north-east', sum: 26, type: 'little-killer' }, { cells: [53, 43, 33, 23, 13, 3], direction: 'north-west', sum: 33, type: 'little-killer' }] },
    ],
    'extreme': [
      { givens: '040000900700020000300000000009000250037500091500941600600000000070004000010600080', rules: [{ cells: [44, 52, 60, 68, 76], direction: 'south-west', sum: 26, type: 'little-killer' }, { cells: [35, 25, 15, 5], direction: 'north-west', sum: 18, type: 'little-killer' }, { cells: [6, 16, 26], direction: 'south-east', sum: 17, type: 'little-killer' }, { cells: [75, 65, 55, 45], direction: 'north-west', sum: 19, type: 'little-killer' }] },
      { givens: '007400150000000000004205000008900006001040000320007000400000000010000840000000570', rules: [{ cells: [62, 52, 42, 32, 22, 12, 2], direction: 'north-west', sum: 41, type: 'little-killer' }, { cells: [76, 68, 60, 52, 44], direction: 'north-east', sum: 27, type: 'little-killer' }, { cells: [62, 70, 78], direction: 'south-west', sum: 11, type: 'little-killer' }, { cells: [27, 19, 11, 3], direction: 'north-east', sum: 22, type: 'little-killer' }] },
    ],
    'impossible': [
      { givens: '000000001002003040050060700005030010030600500400005000008970003070006900200050000', rules: [{ cells: [77, 69, 61, 53], direction: 'north-east', sum: 27, type: 'little-killer' }] },
      { givens: '000000001002003040050060200000001070006080900020400000095000007060300020200050800', rules: [{ cells: [45, 55, 65, 75], direction: 'south-east', sum: 30, type: 'little-killer' }] },
      { givens: '000000001000002030004050607000000310007005000040080709069800000078500000400090806', rules: [{ cells: [62, 70, 78], direction: 'south-west', sum: 20, type: 'little-killer' }] },
    ],
  },
  'modular': {
    'impossible': [
      { givens: '000000001000002340003010520000060070060800000701004003002005004050000900800900000', rules: [{ cells: [31, 40, 48], type: 'modular' }] },
      { givens: '000000001002003040050010600000007008080050010000000506009200000060080004308700000', rules: [{ cells: [55, 45, 54], type: 'modular' }] },
    ],
  },
  'non-consecutive': {
    'tricky': [
      { givens: '000000000900000000300000000050001900000000100470000083700609300000000000000000200', rules: [{ type: 'non-consecutive' }] },
      { givens: '040090000000000000000000000050000900000005100470000083000609300006000000000000006', rules: [{ type: 'non-consecutive' }] },
      { givens: '000090000000000000300000000050000900020080000470000080710609300000000000000000200', rules: [{ type: 'non-consecutive' }] },
    ],
    'hard': [
      { givens: '000041925200000000000590080000905008002680004300410000000070006070830009000209400', rules: [{ type: 'non-consecutive' }] },
      { givens: '030000000100030009500000036000000002000000704000000060740000000095000040800040020', rules: [{ type: 'non-consecutive' }] },
      { givens: '260000009001000002700000000000006000020050000000800000370060000500008420000000003', rules: [{ type: 'non-consecutive' }] },
    ],
    'very-hard': [
      { givens: '000400010000008000300700040005900100000000000000000000016000800200009000003000600', rules: [{ type: 'non-consecutive' }] },
      { givens: '000000090000019000000000000000000400400000700030064000050000948600000000820000000', rules: [{ type: 'non-consecutive' }] },
      { givens: '000100000000000080700000000000700000420000008600000000000000800506000000000501000', rules: [{ type: 'non-consecutive' }] },
    ],
    'expert': [
      { givens: '040000005000000000000000020000000902600080000000000003000009308000000000000000006', rules: [{ type: 'non-consecutive' }] },
      { givens: '000000040400080000003040000009000000000806000000000000005010000140000009300004000', rules: [{ type: 'non-consecutive' }] },
    ],
    'master': [
      { givens: '090000000000630000000400000000000800001000000030040000900000700700096008000000003', rules: [{ type: 'non-consecutive' }] },
      { givens: '000000001000000050000400000000000804001000000030008000000000720000000040000000003', rules: [{ type: 'non-consecutive' }] },
      { givens: '000000000000030000000400000000000804001000000030048000000000720000006040000000003', rules: [{ type: 'non-consecutive' }] },
    ],
    'extreme': [
      { givens: '000000700006490000000000000000004020000000000000000073000000900900000085500740060', rules: [{ type: 'non-consecutive' }] },
      { givens: '000000000706000000000000090000004020000000000000008073000000900000000080581740062', rules: [{ type: 'non-consecutive' }] },
      { givens: '000000700006490010000030000010004020000000000009000003002000900900000080500000000', rules: [{ type: 'non-consecutive' }] },
    ],
    'impossible': [
      { givens: '000000000200006009000092007003000001000000700000008006050000000004030000000000000', rules: [{ type: 'non-consecutive' }] },
      { givens: '050600700007000000069000010004800000000000000080000005000000100000010000070000009', rules: [{ type: 'non-consecutive' }] },
      { givens: '000902004000040000000503000000000000500600800100200000800005900000000000000030000', rules: [{ type: 'non-consecutive' }] },
    ],
  },
  'non-consecutive,parity': {
    'medium': [
      { givens: '000000000008000010000803000040300000000004003000900040307000020000030001000005000', rules: [{ type: 'non-consecutive' }, { cells: [53, 60, 61, 28, 12, 57], parity: 'even', type: 'parity' }, { cells: [56, 18, 16, 25], parity: 'odd', type: 'parity' }] },
      { givens: '000000000008000000000803070040300000000004000000900040300400000000000001400005000', rules: [{ type: 'non-consecutive' }, { cells: [53, 60, 61, 28, 12, 57], parity: 'even', type: 'parity' }, { cells: [56, 18, 16, 25], parity: 'odd', type: 'parity' }] },
    ],
  },
  'non-consecutive,thermometer': {
    'medium': [
      { givens: '000000000000006000000800000000000002000950000000004705001002009000000000590000000', rules: [{ type: 'non-consecutive' }, { cells: [22, 30, 29], type: 'thermometer' }, { cells: [37, 28, 18], type: 'thermometer' }, { cells: [12, 3, 4], type: 'thermometer' }] },
      { givens: '000000000000006000000800000000000002000950000000004705001002009000000000590030000', rules: [{ type: 'non-consecutive' }, { cells: [22, 30, 29], type: 'thermometer' }, { cells: [37, 28, 18], type: 'thermometer' }, { cells: [12, 3, 4], type: 'thermometer' }] },
    ],
  },
  'palindrome': {
    'impossible': [
      { givens: '000001002003000010040050600000070004070500060000608700009005000064080500200900030', rules: [{ cells: [65, 55, 45], type: 'palindrome' }] },
      { givens: '000000001000002034003010500005040003060007000080200900001000050030006000700800000', rules: [{ cells: [58, 59, 51], type: 'palindrome' }] },
    ],
  },
  'parity': {
    'impossible': [
      { givens: '000000001000002030004150600006000007040620000508009060005001000082090000400280500', rules: [{ cells: [42], parity: 'even', type: 'parity' }] },
      { givens: '000000001000002030041030500000000405000006007074050010015070003807000100400900000', rules: [{ cells: [73], parity: 'odd', type: 'parity' }] },
    ],
  },
  'quadruple': {
    'impossible': [
      { givens: '000000001002003040010050600000007000003820007070340080008004070060900504900000000', rules: [{ digits: [2, 5, 8], topLeft: 68, type: 'quadruple' }] },
      { givens: '000000001000002030004050670006000010070040500400800027007008000090000003600090700', rules: [{ digits: [4, 5, 9], topLeft: 55, type: 'quadruple' }] },
    ],
  },
  'region-sum': {
    'impossible': [
      { givens: '000000001000002040004010250002005003060000000700080060003001004040900000800700930', rules: [{ cells: [15, 14, 22], type: 'region-sum' }] },
      { givens: '000000001000002030004050600000007002008000003090040800069005010045700000800090500', rules: [{ cells: [51, 42, 41], type: 'region-sum' }] },
      { givens: '000000001002000040050060700005030010030600500400005008008970003070006900200050000', rules: [{ cells: [14, 22, 32], type: 'region-sum' }] },
    ],
  },
  'renban': {
    'impossible': [
      { givens: '000000001000021034031400500000006700008090000067300010010500007800000000600004050', rules: [{ cells: [46, 56, 65], type: 'renban' }] },
      { givens: '000000001000002030004050670006000010070040500400800020007008000095000003600090700', rules: [{ cells: [61, 53, 43], type: 'renban' }] },
    ],
  },
  'sandwich': {
    'tricky': [
      { givens: '002000000040620095001040036000480920109000053400009060018300500004057000000890604', rules: [{ cells: [78, 69, 60, 51, 42, 33, 24, 15, 6], direction: 'north', sum: 10, type: 'sandwich' }, { cells: [5, 14, 23, 32, 41, 50, 59, 68, 77], direction: 'south', sum: 17, type: 'sandwich' }, { cells: [80, 71, 62, 53, 44, 35, 26, 17, 8], direction: 'north', sum: 11, type: 'sandwich' }, { cells: [18, 19, 20, 21, 22, 23, 24, 25, 26], direction: 'east', sum: 5, type: 'sandwich' }] },
      { givens: '002000000000620095001040036006480920109000403400009060018060500004050002700800604', rules: [{ cells: [78, 69, 60, 51, 42, 33, 24, 15, 6], direction: 'north', sum: 10, type: 'sandwich' }, { cells: [5, 14, 23, 32, 41, 50, 59, 68, 77], direction: 'south', sum: 17, type: 'sandwich' }, { cells: [80, 71, 62, 53, 44, 35, 26, 17, 8], direction: 'north', sum: 11, type: 'sandwich' }, { cells: [18, 19, 20, 21, 22, 23, 24, 25, 26], direction: 'east', sum: 5, type: 'sandwich' }] },
      { givens: '062000000040620005001048030000480920109000003400009060018300500004057000000890004', rules: [{ cells: [78, 69, 60, 51, 42, 33, 24, 15, 6], direction: 'north', sum: 10, type: 'sandwich' }, { cells: [5, 14, 23, 32, 41, 50, 59, 68, 77], direction: 'south', sum: 17, type: 'sandwich' }, { cells: [80, 71, 62, 53, 44, 35, 26, 17, 8], direction: 'north', sum: 11, type: 'sandwich' }, { cells: [18, 19, 20, 21, 22, 23, 24, 25, 26], direction: 'east', sum: 5, type: 'sandwich' }] },
    ],
    'impossible': [
      { givens: '000001002000030040005600700008009060050000800670800000000900400080024030400000001', rules: [{ cells: [62, 61, 60, 59, 58, 57, 56, 55, 54], direction: 'west', sum: 6, type: 'sandwich' }] },
      { givens: '000000001000002340003040250000005003060700000801090000004001005070800000900060000', rules: [{ cells: [7, 16, 25, 34, 43, 52, 61, 70, 79], direction: 'south', sum: 17, type: 'sandwich' }] },
    ],
  },
  'skyscrapers': {
    'tricky': [
      { givens: '000070008010060940000010025005900476790000002600007010000050380001038090080706001', rules: [{ cells: [35, 34, 33, 32, 31, 30, 29, 28, 27], count: 4, direction: 'west', type: 'skyscrapers' }, { cells: [5, 14, 23, 32, 41, 50, 59, 68, 77], count: 1, direction: 'south', type: 'skyscrapers' }, { cells: [71, 70, 69, 68, 67, 66, 65, 64, 63], count: 2, direction: 'west', type: 'skyscrapers' }, { cells: [80, 79, 78, 77, 76, 75, 74, 73, 72], count: 4, direction: 'west', type: 'skyscrapers' }] },
      { givens: '000070008010060940000010025005900476790000002600007010000050380001038090080706201', rules: [{ cells: [35, 34, 33, 32, 31, 30, 29, 28, 27], count: 4, direction: 'west', type: 'skyscrapers' }, { cells: [5, 14, 23, 32, 41, 50, 59, 68, 77], count: 1, direction: 'south', type: 'skyscrapers' }, { cells: [71, 70, 69, 68, 67, 66, 65, 64, 63], count: 2, direction: 'west', type: 'skyscrapers' }, { cells: [80, 79, 78, 77, 76, 75, 74, 73, 72], count: 4, direction: 'west', type: 'skyscrapers' }] },
    ],
    'impossible': [
      { givens: '000000001000012030004500200000006020007800500630000008009008000070040900450900000', rules: [{ cells: [80, 71, 62, 53, 44, 35, 26, 17, 8], count: 5, direction: 'north', type: 'skyscrapers' }] },
      { givens: '000001002000003450002060007004008000020600004760040030006080003010500900000000020', rules: [{ cells: [72, 73, 74, 75, 76, 77, 78, 79, 80], count: 1, direction: 'east', type: 'skyscrapers' }] },
    ],
  },
  'skyscrapers,x-sum': {
    'medium': [
      { givens: '008304600000900004600500080400032007000005300090100000384600700900000036005000000', rules: [xSum(1, 'south', 1), skyscraper(7, 'south', 1)] },
    ],
  },
  'thermometer': {
    'impossible': [
      { givens: '000000001000002340004010250000670000005024000080030060003001005500080930970000000', rules: [{ cells: [44, 52, 61], type: 'thermometer' }] },
      { givens: '000000001002003040050060700005030010030600500400005008008070003070006900200050000', rules: [{ cells: [46, 56, 57], type: 'thermometer' }] },
    ],
  },
  'thermometer,xv-five': {
    'impossible': [
      { givens: '000000001000003040005600700000004030008500600010000002009006000800070000750900000', rules: [{ five: { pairs: [[13, 14]] }, ten: {  }, type: 'xv' }, { cells: [51, 61, 69], type: 'thermometer' }] },
      { givens: '000000001000002004003000500006010050070000000800900006007060013030700600064030005', rules: [{ five: { pairs: [[21, 22]] }, ten: {  }, type: 'xv' }, { cells: [8, 16, 17], type: 'thermometer' }] },
    ],
  },
  'whispers': {
    'impossible': [
      { givens: '000001002000030040001002530005020004060000700800900000000040003070200060900008000', rules: [{ cells: [65, 56, 64], minDifference: 5, type: 'whispers' }] },
      { givens: '000000001000002340001000520000004003060070000040800090004001005070900000810060000', rules: [{ cells: [29, 28, 20], minDifference: 5, type: 'whispers' }] },
    ],
  },
  'x-sum': {
    'tricky': [
      { givens: '000070008010060943000010025105000470790000002600007810000050384001038090080700201', rules: [xSum(35, 'west', 37), xSum(5, 'south', 45), xSum(71, 'west', 38), xSum(80, 'west', 1)] },
      { givens: '040070008010060940000010025005000476790000002600007010000050380001038000080700201', rules: [xSum(35, 'west', 37), xSum(5, 'south', 45), xSum(71, 'west', 38), xSum(80, 'west', 1)] },
      { givens: '000070008010060940000010025005900476790000002600007010000050380001038090080706201', rules: [xSum(35, 'west', 37), xSum(5, 'south', 45), xSum(71, 'west', 38), xSum(80, 'west', 1)] },
    ],
    'extreme': [
      { givens: '000300000490000002000060150000030040000000000080006900900000201700005000040080070', rules: [xSum(36, 'east', 33), xSum(80, 'west', 45), xSum(8, 'west', 34), xSum(5, 'south', 22)] },
      { givens: '000300000490000000000060150000030040000000000080006900900000201700005000040080070', rules: [xSum(36, 'east', 33), xSum(80, 'west', 45), xSum(8, 'west', 34), xSum(5, 'south', 22)] },
      { givens: '000300000490000000000060154000030040000000000080006900900000201700005000040080070', rules: [xSum(36, 'east', 33), xSum(80, 'west', 45), xSum(8, 'west', 34), xSum(5, 'south', 22)] },
    ],
    'impossible': [
      { givens: '000001000000003040005060700007100000080005004500080900050090600908000020706300000', rules: [xSum(8, 'west', 8)] },
      { givens: '000000002000003004004010500005000006070800000320009000002050040080007600900300000', rules: [xSum(7, 'south', 1)] },
    ],
  },
  'xv': {
    'impossible': [
      { givens: '000000001000023000005600700008000006050800090970000800007500900030001000500040002', rules: [{ five: { pairs: [[38, 47]] }, ten: { pairs: [[7, 16]] }, type: 'xv' }] },
      { givens: '000000001002003040010560002000070000003006020700800500009000000640009003230040090', rules: [{ five: { pairs: [[49, 58]] }, ten: { pairs: [[26, 35]] }, type: 'xv' }] },
      { givens: '000000001002003000040050060000700008009560700070004050050300070000000002107040800', rules: [{ five: { pairs: [[43, 44]] }, ten: { pairs: [[63, 72]] }, type: 'xv' }] },
    ],
  },
  'xv-five': {
    'extreme': [
      { givens: '004000009003409576790000408900005300000700000506000000078000600000003040000600000', rules: [{ five: { pairs: [[23, 24], [49, 58], [33, 42], [37, 46]] }, ten: {  }, type: 'xv' }] },
      { givens: '004000009003400506790000408000005300000790000506000000078000000002003040000600000', rules: [{ five: { pairs: [[23, 24], [49, 58], [33, 42], [37, 46]] }, ten: {  }, type: 'xv' }] },
      { givens: '000000009003409076090000408900005300000700200506000000078000600000003940000600000', rules: [{ five: { pairs: [[23, 24], [49, 58], [33, 42], [37, 46]] }, ten: {  }, type: 'xv' }] },
    ],
    'impossible': [
      { givens: '000000001000003040050640700000080900008300020500020000004068010010400800085030060', rules: [{ five: { pairs: [[11, 20]] }, ten: {  }, type: 'xv' }] },
      { givens: '000000001002003040050060070000008300070900400200050090007090050500800000960000004', rules: [{ five: { pairs: [[41, 42]] }, ten: {  }, type: 'xv' }] },
      { givens: '000000002000003045004050600002060001070000006800900200005010060090007000300800000', rules: [{ five: { pairs: [[7, 16]] }, ten: {  }, type: 'xv' }] },
    ],
  },
  'xv-ten': {
    'extreme': [
      { givens: '002000000000000300000050006003060002000102970904000010000000000050000100100040000', rules: [{ five: {  }, ten: { pairs: [[10, 11], [59, 60], [13, 14], [50, 59]] }, type: 'xv' }] },
      { givens: '009300070050900040000050038060080020000000300080070500031004000005001000000000000', rules: [{ five: {  }, ten: { pairs: [[75, 76], [39, 40], [20, 21], [45, 54]] }, type: 'xv' }] },
    ],
    'impossible': [
      { givens: '000000012000003004000010500006020005070006020800900600001060050090008000300700000', rules: [{ five: {  }, ten: { pairs: [[20, 29]] }, type: 'xv' }] },
      { givens: '000000001000002000003040500004060700080054600900800000005400007300070000740605300', rules: [{ five: {  }, ten: { pairs: [[16, 25]] }, type: 'xv' }] },
    ],
  },
}
