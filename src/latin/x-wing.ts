import { bit, candidateCount, latinLineRules, type LatinRule } from './engine.ts'

export const xWingTechnique = 'X-wing'

const rulesBySize: LatinRule[] = []

export function xWingRule(size: number): LatinRule {
  return rulesBySize[size] ??= buildRule(size)
}

function buildRule(size: number): LatinRule {
  const lines = latinLineRules(size)
  const rows = lines.slice(0, size).map(line => line.cells)
  const columns = lines.slice(size).map(line => line.cells)
  const rowPositions = new Uint16Array(size * size)
  const columnPositions = new Uint16Array(size * size)
  const seen = new Uint16Array(size)
  const orientations = [
    { lines: rows, positions: rowPositions, base: 'rows', cover: 'columns' },
    { lines: columns, positions: columnPositions, base: 'columns', cover: 'rows' },
  ] as const
  return {
    kind: 'x-wing',
    label: xWingTechnique,
    cells: rows.flat(),
    afterBasic: true,
    support(domains, explain) {
      rowPositions.fill(0)
      columnPositions.fill(0)
      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          for (let mask = domains[row * size + column]; mask; mask &= mask - 1) {
            const digit = 31 - Math.clz32(mask & -mask)
            rowPositions[digit * size + row] |= 1 << column
            columnPositions[digit * size + column] |= 1 << row
          }
        }
      }

      for (const { lines, positions: byDigit, base, cover } of orientations) {
        for (let digit = 1; digit <= size; digit++) {
          const candidate = bit(digit)
          seen.fill(0)
          for (let second = 0; second < size; second++) {
            const positions = byDigit[(digit - 1) * size + second]
            if (candidateCount(positions) !== 2) continue
            const first = seen.indexOf(positions)
            seen[second] = positions
            if (first === -1) continue

            const low = 31 - Math.clz32(positions & -positions)
            const high = 31 - Math.clz32(positions)
            const offsets = [low, high]
            let supported: number[] | undefined
            for (let index = 0; index < size; index++) {
              if (index === first || index === second) continue
              for (const offset of offsets) {
                const cell = lines[index][offset]
                const mask = domains[cell]
                if (!(mask & candidate)) continue
                if (mask === candidate) return null
                supported ??= [...domains]
                supported[cell] &= ~candidate
              }
            }
            if (!supported) continue
            explain?.({
              cells: [lines[first][low], lines[first][high], lines[second][low], lines[second][high]],
              sourceCells: [...lines[first], ...lines[second]],
              label: `In ${base} ${first + 1} and ${second + 1}, ${digit} can only go in ${cover} ${low + 1} and ${high + 1}. ` +
                `The two placements must use different ${cover}. Remove ${digit} from those ${cover} in all other ${base}.`,
            })
            return supported
          }
        }
      }
      return domains
    },
  }
}
