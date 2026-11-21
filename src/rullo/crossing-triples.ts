type Restriction = { offset: number; patterns: number }
type Support = { kept: number; removed: number; count: number }
export type CrossingLineChoices = {
  readonly masks: readonly number[]
  readonly variable: number
  support?: Map<number, Support>
}

// Each pair of choices fixes which patterns are still available for the
// third line. Reuse its search when another pair requires the same cells.
export function crossingTripleSupport(
  lines: readonly [CrossingLineChoices, CrossingLineChoices, CrossingLineChoices],
  restrictions: readonly Restriction[],
) {
  const [first, second, third] = lines
  // Index these masks by the keep/remove choices for the first two lines.
  const requiredKeep = [0, 0, 0, 0]
  const requiredRemove = [0, 0, 0, 0]
  for (const { offset, patterns } of restrictions) {
    const bit = 1 << offset
    for (let prefix = 0; prefix < 4; prefix++) {
      if (!(patterns & (1 << prefix))) requiredKeep[prefix] |= bit
      if (!(patterns & (1 << (prefix + 4)))) requiredRemove[prefix] |= bit
    }
  }
  // The third line can appear in several triples in the same grid position.
  const thirdSupport = third.support ??= new Map<number, Support>()
  let count = 0
  let firstKeep = 0
  let firstRemove = 0
  let secondKeep = 0
  let secondRemove = 0
  let thirdKeep = 0
  let thirdRemove = 0

  for (let i = 0; i < first.masks.length; i++) {
    const a = first.masks[i]
    const keepWhenRemoved = (~a & requiredKeep[0]) | (a & requiredKeep[1])
    const keepWhenKept = (~a & requiredKeep[2]) | (a & requiredKeep[3])
    const removeWhenRemoved = (~a & requiredRemove[0]) | (a & requiredRemove[1])
    const removeWhenKept = (~a & requiredRemove[2]) | (a & requiredRemove[3])
    for (let j = 0; j < second.masks.length; j++) {
      const b = second.masks[j]
      const mustKeep = (~b & keepWhenRemoved) | (b & keepWhenKept)
      const mustRemove = (~b & removeWhenRemoved) | (b & removeWhenKept)
      if (mustKeep & mustRemove) continue
      // Each line has at most eight cells.
      const key = (mustKeep << 8) | mustRemove
      let support = thirdSupport.get(key)
      if (!support) {
        const constrained = mustKeep | mustRemove
        let kept = 0
        let removed = 0
        let matches = 0
        for (let k = 0; k < third.masks.length; k++) {
          const c = third.masks[k]
          if ((c & constrained) !== mustKeep) continue
          kept |= c
          removed |= ~c
          matches++
        }
        support = { kept, removed, count: matches }
        thirdSupport.set(key, support)
      }
      if (!support.count) continue
      count += support.count
      firstKeep |= a
      firstRemove |= ~a
      secondKeep |= b
      secondRemove |= ~b
      thirdKeep |= support.kept
      thirdRemove |= support.removed
      // Every undecided cell can be kept and removed. This triple has no move.
      if ((firstKeep & firstRemove) === first.variable &&
        (secondKeep & secondRemove) === second.variable &&
        (thirdKeep & thirdRemove) === third.variable) return undefined
    }
  }

  if (!count) return null
  return {
    count,
    kept: [firstKeep, secondKeep, thirdKeep],
    removed: [firstRemove, secondRemove, thirdRemove],
  }
}
