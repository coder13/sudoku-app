import { candidateCount, cellLabel, latinLineRules, type LatinRule } from '../latin/engine.ts'
import type { inequalityPaths } from './inequality-paths.ts'

type BoundPath = { cell: number; distance: number }

function allowedDigits(bound: number, distance: number, below: boolean) {
  if (!below) return ~((bound << distance) - 1)
  const maximum = bound >> distance
  return maximum ? 2 * maximum - 1 : 0
}

export function sharedBoundSupport(
  domains: readonly number[], boundCell: number, first: BoundPath, second: BoundPath, below: boolean,
): number[] | null {
  let firstSupport = 0
  let boundSupport = 0
  let secondSupport = 0
  for (let candidates = domains[boundCell]; candidates; candidates &= candidates - 1) {
    const bound = candidates & -candidates
    const firstCandidates = domains[first.cell] & allowedDigits(bound, first.distance, below)
    const secondCandidates = domains[second.cell] & allowedDigits(bound, second.distance, below)
    if (!firstCandidates || !secondCandidates) continue

    // If one cell has only one candidate, the other cell needs a different digit.
    const firstChoices = (secondCandidates & (secondCandidates - 1)) === 0
      ? firstCandidates & ~secondCandidates : firstCandidates
    const secondChoices = (firstCandidates & (firstCandidates - 1)) === 0
      ? secondCandidates & ~firstCandidates : secondCandidates
    if (!firstChoices || !secondChoices) continue
    firstSupport |= firstChoices
    boundSupport |= bound
    secondSupport |= secondChoices
  }
  return boundSupport ? [firstSupport, boundSupport, secondSupport] : null
}

export function inequalityBoundRules(size: number, { ascending, descending }: ReturnType<typeof inequalityPaths>): LatinRule[] {
  const rules: LatinRule[] = []
  for (const [pathsByStart, below] of [[descending, true], [ascending, false]] as const) {
    for (const [bound, paths] of pathsByStart.entries()) {
      for (const line of latinLineRules(size)) {
        const peers = line.cells.filter(cell => cell !== bound && paths[cell])
        for (const [index, first] of peers.entries()) {
          for (const second of peers.slice(index + 1)) {
            const firstPath = paths[first]!
            const secondPath = paths[second]!
            // The basic rules already handle two direct neighbors and ordered pairs.
            if (firstPath.length === 2 && secondPath.length === 2) continue
            if (ascending[first][second] || ascending[second][first]) continue
            const signs = [firstPath, secondPath].map(path =>
              (below ? path.slice().reverse() : path).map(cell => cellLabel(cell, size)).join(' < '))
            const different = `${cellLabel(first, size)} and ${cellLabel(second, size)} need different digits in ${line.label.toLowerCase()}.`
            const pathsLabel = `${different} The signs give ${signs[0]} and ${signs[1]}.`
            const cells = [...new Set([...firstPath, ...secondPath])]
            const firstEnd = { cell: first, distance: firstPath.length - 1 }
            const secondEnd = { cell: second, distance: secondPath.length - 1 }
            const boundary = below ? firstPath.length : size - firstEnd.distance
            const label = firstEnd.distance === secondEnd.distance
              ? `${pathsLabel} If ${cellLabel(bound, size)} is ${boundary}, both endpoints must be ${below ? 1 : size}.`
              : pathsLabel
            rules.push({
              kind: 'inequality-bound',
              label,
              cells: [first, bound, second],
              afterBasic: true,
              support(domains, explain) {
                const supported = sharedBoundSupport(domains, bound, firstEnd, secondEnd, below)
                if (supported) explain?.({ label, cells })
                return supported
              },
            })
          }
        }
      }
    }
  }
  return rules
}

const alternatives = new Intl.ListFormat('en', { type: 'disjunction' })
const comparisons = new Intl.ListFormat('en')

export function lineDigitBoundRules(size: number, { ascending, descending }: ReturnType<typeof inequalityPaths>): LatinRule[] {
  const rules: LatinRule[] = []
  const lines = latinLineRules(size)
  for (const [pathsByStart, below] of [[descending, true], [ascending, false]] as const) {
    for (const [bound, paths] of pathsByStart.entries()) {
      for (const line of lines) {
        const linked = line.cells.flatMap(cell => cell !== bound && paths[cell] ? [{ cell, path: paths[cell]! }] : [])
        if (linked.length < 2) continue
        const boundInLine = line.cells.includes(bound)
        // The line's own signs already cover paths that stay within it.
        if (boundInLine && linked.every(({ path }) => path.every(cell => line.cells.includes(cell)))) continue
        const unlinked = line.cells.filter(cell => !linked.some(site => site.cell === cell))
        const cells = boundInLine ? line.cells : [...line.cells, bound]
        const boundName = cellLabel(bound, size)
        rules.push({
          kind: 'line-digit-bound',
          label: `${line.label} uses each digit once. The signs limit ${boundName}.`,
          cells,
          afterBasic: true,
          support(domains, explain) {
            let confined = 0
            for (const { cell } of linked) confined |= domains[cell]
            for (const cell of unlinked) confined &= ~domains[cell]
            if (!confined) return cells.map(cell => domains[cell])

            let supported = domains[bound]
            let witness = 0
            let witnessDistance = 0
            for (; confined; confined &= confined - 1) {
              const digit = confined & -confined
              let count = 0
              let distance = size
              for (const { cell, path } of linked) {
                if (!(domains[cell] & digit)) continue
                count++
                distance = Math.min(distance, path.length - 1)
              }
              // A single position is handled by the basic line and sign rules.
              if (count < 2) continue
              const next = supported & allowedDigits(digit, distance, !below)
              if (!next) return null
              if (next === supported) continue
              supported = next
              // Each bound changes the same end of the range. The last
              // change has the strongest bound and explains all removals.
              witness = digit
              witnessDistance = distance
            }
            if (explain && witness) {
              const digit = 32 - Math.clz32(witness)
              const sites = linked.filter(({ cell }) => domains[cell] & witness)
              const names = alternatives.format(sites.map(({ cell }) => cellLabel(cell, size)))
              const signs = comparisons.format(sites.map(({ path }) =>
                (below ? path.slice().reverse() : path).map(cell => cellLabel(cell, size)).join(' < ')))
              const limit = digit + (below ? witnessDistance : -witnessDistance)
              const label = `${line.label} needs a ${digit}. It can only go in ${names}. The signs give ${signs}. So ${boundName} must be ${below ? 'at least' : 'at most'} ${limit}.`
              explain({ label, cells: [...new Set([...cells, ...sites.flatMap(({ path }) => path)])] })
            }
            return cells.map(cell => cell === bound ? supported : domains[cell])
          },
        })
      }
    }
  }
  return rules
}

function insufficientDigits(candidates: readonly number[], unions: Uint16Array) {
  // A line can use distinct digits only if each subset of cells has at
  // least that many candidate digits. Keep the failing subset for the hint.
  for (let subset = 1; subset < unions.length; subset++) {
    const cell = subset & -subset
    const digits = unions[subset ^ cell] | candidates[31 - Math.clz32(cell)]
    unions[subset] = digits
    if (candidateCount(digits) < candidateCount(subset)) return { subset, digits }
  }
}

export function inequalityLineMatchingRules(
  size: number, { ascending, descending }: ReturnType<typeof inequalityPaths>,
): LatinRule[] {
  const rules: LatinRule[] = []
  const lines = latinLineRules(size)
  const linesByCell: number[][] = Array.from({ length: size * size }, () => [])
  for (const [index, { cells }] of lines.entries()) {
    for (const cell of cells) linesByCell[cell].push(index)
  }
  const linkedCounts = new Uint8Array(lines.length)
  for (let bound = 0; bound < size * size; bound++) {
    const belowPaths = descending[bound]
    const abovePaths = ascending[bound]
    linkedCounts.fill(0)
    for (let cell = 0; cell < Math.max(belowPaths.length, abovePaths.length); cell++) {
      if (cell === bound || !(belowPaths[cell] || abovePaths[cell])) continue
      for (const index of linesByCell[cell]) linkedCounts[index]++
    }
    for (const [index, line] of lines.entries()) {
      // Pair and digit bounds already handle individual signs and short forks.
      if (linkedCounts[index] < 3 || line.cells.includes(bound)) continue
      const linked = line.cells.flatMap((cell, offset) => {
        const below = belowPaths[cell]
        const above = abovePaths[cell]
        return below || above ? [{ offset, below, above }] : []
      })
      const cells = [...line.cells, bound]
      const label = `${line.label} needs different digits in every cell.`
      const name = cellLabel(bound, size)
      rules.push({
        kind: 'inequality-line-matching',
        label,
        cells,
        afterBasic: true,
        support(domains, explain) {
          const candidates = line.cells.map(cell => domains[cell])
          const constrained = candidates.slice()
          let unions: Uint16Array | undefined
          let supported = domains[bound]
          let proofs: string[] | undefined
          let highlighted: Set<number> | undefined
          for (let choices = supported; choices; choices &= choices - 1) {
            const digit = choices & -choices
            let changed = false
            for (const { offset, below, above } of linked) {
              let allowed = candidates[offset]
              if (below) allowed &= allowedDigits(digit, below.length - 1, true)
              if (above) allowed &= allowedDigits(digit, above.length - 1, false)
              constrained[offset] = allowed
              changed ||= allowed !== candidates[offset]
            }
            if (!changed) continue
            const failure = insufficientDigits(constrained, unions ??= new Uint16Array(1 << size))
            if (!failure) continue
            supported &= ~digit
            if (!supported) return null
            if (!explain) continue

            const witness = line.cells.filter((_, offset) => failure.subset & (1 << offset))
            const digits = Array.from({ length: size }, (_, i) => i + 1)
              .filter(value => failure.digits & (1 << (value - 1))).map(String)
            const names = comparisons.format(witness.map(cell => cellLabel(cell, size)))
            const trial = `If ${name} is ${32 - Math.clz32(digit)}`
            const remaining = digits.length === 1 ? `Their only candidate is ${digits[0]}.`
              : `Their only candidates are ${comparisons.format(digits)}.`
            const shortage = witness.length === 1 ? `${names} has no candidate.`
              : `${names} need ${witness.length} different digits. ${remaining}`
            proofs ??= []
            proofs.push(`${trial}, ${shortage}`)
            highlighted ??= new Set([bound])
            for (const cell of witness) highlighted.add(cell)
            for (const { offset, below, above } of linked) {
              if (!(failure.subset & (1 << offset)) || constrained[offset] === candidates[offset]) continue
              for (const cell of below ?? []) highlighted.add(cell)
              for (const cell of above ?? []) highlighted.add(cell)
            }
          }
          if (proofs && highlighted) explain?.({ label: [label, ...proofs].join(' '), cells: [...highlighted], sourceCells: cells })
          return [...candidates, supported]
        },
      })
    }
  }
  return rules
}
