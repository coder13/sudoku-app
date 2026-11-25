import type { SizedConstraintRule, SizedSkyscrapersRule } from './engine.ts'

export function validSizedSkyscrapersRule(rule: SizedSkyscrapersRule, size: number) {
  return Object.keys(rule).length === 4 && rule.type === 'skyscrapers' &&
    ['north', 'east', 'south', 'west'].includes(rule.direction) &&
    Number.isInteger(rule.index) && rule.index >= 0 && rule.index < size &&
    Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= size
}

export function skyscrapersCount(values: string, rule: SizedSkyscrapersRule, size: number) {
  const cells = Array.from({ length: size }, (_, offset) => {
    if (rule.direction === 'north') return offset * size + rule.index
    if (rule.direction === 'south') return (size - 1 - offset) * size + rule.index
    if (rule.direction === 'west') return rule.index * size + offset
    return rule.index * size + size - 1 - offset
  })
  let tallest = 0, visible = 0
  for (const cell of cells) {
    const height = Number(values[cell])
    if (height > tallest) {
      tallest = height
      visible++
    }
  }
  return visible
}

export function skyscrapersState(rules: readonly SizedConstraintRule[] | undefined, values: string, size: number) {
  const clues = rules?.filter(rule => rule.type === 'skyscrapers')
  if (!clues?.length) return
  const conflicts = new Set<number>()
  for (const rule of clues) {
    const positions = Array.from({ length: size }, (_, offset) => {
      if (rule.direction === 'north') return offset * size + rule.index
      if (rule.direction === 'south') return (size - 1 - offset) * size + rule.index
      if (rule.direction === 'west') return rule.index * size + offset
      return rule.index * size + size - 1 - offset
    })
    if (positions.every(cell => values[cell] !== '0') && skyscrapersCount(values, rule, size) !== rule.count) {
      for (const cell of positions) conflicts.add(cell)
    }
  }
  return { allowed: Array<number>(values.length).fill((1 << size) - 1), conflicts }
}
