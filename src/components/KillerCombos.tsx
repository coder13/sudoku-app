import { useMemo } from 'react'
import type { VariantPuzzle } from '../sudoku/engine'

type Props = {
  puzzle?: VariantPuzzle
  values: string
  active: number
  visible: boolean
}

function combinations(size: number, sum: number, required: Set<number>) {
  const result: string[] = []
  const visit = (next: number, digits: number[], remaining: number) => {
    if (digits.length === size) {
      if (remaining === 0 && [...required].every((digit) => digits.includes(digit))) result.push(digits.join(''))
      return
    }
    const slots = size - digits.length - 1
    for (let digit = next; digit <= 9; digit++) {
      const left = remaining - digit
      if (left < slots * (digit + 1)) break
      if (left > (slots * (18 - slots + 1)) / 2) continue
      visit(digit + 1, [...digits, digit], left)
    }
  }
  if (required.size <= size && [...required].every((digit) => digit >= 1 && digit <= 9)) visit(1, [], sum)
  return result
}

export function KillerCombos({ puzzle, values, active, visible }: Props) {
  const cage = puzzle?.rules.flatMap((rule) => rule.type === 'killer-cages' ? rule.cages : [])
    .find(({ cells }) => cells.includes(active))
  const combos = useMemo(() => {
    if (!cage) return []
    const placed = cage.cells.map((cell) => Number(values[cell])).filter((digit) => digit > 0)
    if (new Set(placed).size !== placed.length) return []
    return combinations(cage.cells.length, cage.sum, new Set(placed))
  }, [cage, values])

  if (!visible || !cage || !combos.length) return null
  return <div className="killer-combo-chips" role="group" aria-label="Killer cage combinations">
    {combos.map((combo) => <span className="killer-combo-chip" key={combo}>{combo}</span>)}
  </div>
}
