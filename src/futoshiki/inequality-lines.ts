import { candidateCount, cellLabel, latinLineRules, type LatinRule } from '../latin/engine.ts'
import { pathsOutsideLine } from './inequality-paths.ts'

function lineSupport(candidates: readonly number[], predecessors: readonly number[]): number[] | null {
  const size = candidates.length
  const all = (1 << size) - 1
  const supported = Array<number>(size).fill(0)
  const memo = new Int8Array(1 << size)
  const cellsForDigit = Array<number>(size).fill(0)
  for (const [offset, candidate] of candidates.entries()) {
    for (let digits = candidate; digits; digits &= digits - 1) {
      const digit = 31 - Math.clz32(digits & -digits)
      cellsForDigit[digit] |= 1 << offset
    }
  }

  // Assign digits in order. The occupied cells determine the next digit
  // and which inequality predecessors already have smaller digits.
  function visit(occupied: number): boolean {
    if (occupied === all) return true
    if (memo[occupied]) return memo[occupied] === 1

    const digit = candidateCount(occupied)
    let found = false
    for (let choices = cellsForDigit[digit] & ~occupied; choices; choices &= choices - 1) {
      const cell = choices & -choices
      const offset = 31 - Math.clz32(cell)
      if (predecessors[offset] & ~occupied || !visit(occupied | cell)) continue
      supported[offset] |= 1 << digit
      found = true
    }
    memo[occupied] = found ? 1 : -1
    return found
  }

  return visit(0) ? supported : null
}

function lineRule(
  size: number, line: LatinRule, direct: readonly (readonly number[])[], chain?: readonly number[],
): LatinRule {
  const { cells } = line
  const predecessors = Array<number>(size).fill(0)
  for (const [less, greater] of direct) {
    const first = cells.indexOf(less)
    const last = cells.indexOf(greater)
    predecessors[last] |= 1 << first
  }
  const signs = direct.map(([less, greater]) => `${cellLabel(less, size)} is less than ${cellLabel(greater, size)}.`)
  const label = [`${line.label} uses each digit once.`, ...signs].join(' ')
  if (!chain) return {
    kind: 'inequality-line',
    label,
    cells,
    afterBasic: true,
    support: domains => lineSupport(cells.map(cell => domains[cell]), predecessors),
  }

  const start = cells.indexOf(chain[0])
  const end = cells.indexOf(chain[chain.length - 1])
  const middle = chain.slice(1, -1)
  const witness = [...cells, ...middle]
  const chainLabel = `${label} The signs give ${chain.map(cell => cellLabel(cell, size)).join(' < ')}.`
  return {
    kind: 'inequality-chain-line',
    label: chainLabel,
    cells: witness,
    afterBasic: true,
    support(domains, explain) {
      const candidates = cells.map(cell => domains[cell])
      const supported = Array<number>(size).fill(0)
      const middleCandidates = middle.map(cell => domains[cell])
      const constrained = [...candidates]
      let obstruction: string | undefined
      for (let choices = candidates[start]; choices; choices &= choices - 1) {
        const first = choices & -choices
        let lower = first
        for (const mask of middleCandidates) {
          const next = mask & ~(2 * lower - 1)
          lower = next & -next
          if (!lower) break
        }
        if (!lower) continue
        // The least possible middle digits leave the widest choice for the final cell.
        const last = candidates[end] & ~(2 * lower - 1)
        if (!last) continue
        constrained[start] = first
        constrained[end] = last
        const support = lineSupport(constrained, predecessors)
        if (!support) {
          if (explain && !obstruction && candidateCount(last) === 1) {
            const blocked = candidates.findIndex((mask, offset) =>
              mask && offset !== start && offset !== end && !(mask & ~(first | last)))
            if (blocked !== -1) {
              const from = cellLabel(cells[start], size)
              const to = cellLabel(cells[end], size)
              const empty = cellLabel(cells[blocked], size)
              obstruction = `If ${from} is ${32 - Math.clz32(first)}, the chain forces ${to} to be ${32 - Math.clz32(last)}. Then ${empty} has no candidate.`
            }
          }
          continue
        }
        for (let offset = 0; offset < size; offset++) supported[offset] |= support[offset]
      }
      if (supported[start] && obstruction) explain?.({ label: `${chainLabel} ${obstruction}`, cells: witness })
      return supported[start] ? [...supported, ...middleCandidates] : null
    },
  }
}

export function inequalityLineRules(
  size: number, smallerByEdge: ReadonlyMap<string, number>, successors?: readonly number[][],
) {
  const direct: LatinRule[] = []
  const chains: LatinRule[] = []
  for (const line of latinLineRules(size)) {
    const { cells } = line
    const signs: number[][] = []
    for (let offset = 1; offset < size; offset++) {
      const first = cells[offset - 1]
      const second = cells[offset]
      const smaller = smallerByEdge.get(`${first}-${second}`)
      if (smaller !== undefined) signs.push([smaller, smaller === first ? second : first])
    }
    if (signs.length >= 2) direct.push(lineRule(size, line, signs))
    if (!successors) continue
    for (const path of pathsOutsideLine(cells, successors)) {
      chains.push(lineRule(size, line, signs, path))
    }
  }
  return { direct, chains }
}
