import type { VariantPuzzle, VariantRule } from './engine.ts'
import type { PlayableVariant } from './variants.ts'

const cells = Array.from({ length: 81 }, (_, i) => i)
const edges = cells.flatMap(i => [i % 9 < 8 ? i + 1 : -1, i < 72 ? i + 9 : -1]
  .filter(j => j >= 0).map(j => [i, j] as const))
const neighbors = cells.map(i => edges.flatMap(([a, b]) => a === i ? [b] : b === i ? [a] : []))
const lineNeighbors = cells.map(i => cells.filter(j => i !== j &&
  Math.abs(Math.floor(i/9) - Math.floor(j/9)) <= 1 && Math.abs(i%9 - j%9) <= 1))
const opposite = (i: number) => 80 - i

export function randomIndex(seed: number) {
  let state = seed || 0x9e3779b9
  return (limit: number) => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
}

// Opposite bands can be paired in six ways. The middle band has one fixed row.
// These 54 legal axis orders realize every possible half-turn pairing on that axis.
const axes: number[][] = []
for (let middle = 0; middle < 3; middle++) {
  const [first, last] = [0, 1, 2].filter(b => b !== middle)
  for (const center of [0, 1, 2]) {
    const [left, right] = [0, 1, 2].filter(r => r !== center)
    for (const p of [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]]) {
      axes.push([first*3, first*3+1, first*3+2, middle*3+left, middle*3+center, middle*3+right,
        ...p.map(i => last*3+i)])
    }
  }
}

export function givenPairing(grid: string) {
  let pairs = 0, total = 0
  for (let i = 0; i < 40; i++) {
    const a = grid[i] !== '0', b = grid[80-i] !== '0'
    if (a && b) pairs += 2
    total += Number(a) + Number(b)
  }
  return total ? pairs / total : null
}

/** Equivalent classic grids with the most paired givens. The caller grades each actual orientation. */
export function classicLayouts(grid: string, seed: number, limit: number) {
  const top: { score: number; grid: string }[] = []
  const digits = [...grid]
  const n = digits.filter(d => d !== '0').length
  const start = seed % (axes.length * axes.length)
  for (let offset = 0; offset < axes.length * axes.length; offset++) {
    const index = (start + offset) % (axes.length * axes.length)
    const rows = axes[Math.floor(index / axes.length)], cols = axes[index % axes.length]
    let pairs = 0
    for (let i = 0; i < 40; i++) {
      const r = Math.floor(i / 9), c = i % 9
      if (digits[rows[r]*9+cols[c]] !== '0' && digits[rows[8-r]*9+cols[8-c]] !== '0') pairs += 2
    }
    const score = pairs / (n - Number(digits[rows[4]*9+cols[4]] !== '0'))
    if (top.length === limit && top[limit-1].score >= score) continue
    const ordered = rows.flatMap(r => cols.map(c => digits[9*r+c])).join('')
    if (top.some(t => t.grid === ordered)) continue
    top.push({ score, grid: ordered })
    top.sort((a, b) => b.score - a.score)
    if (top.length > limit) top.pop()
  }
  return top.map(t => t.grid)
}

// Compare the visible clue layers separately. Ordinary 3×3 lines and fixed diagonal guides
// would award free symmetry to every puzzle, so they do not enter this score.
export function clueShapes(puzzle: VariantPuzzle) {
  const marks = new Map<string, string>()
  function geometry(kind: string, path: readonly number[], ordered: boolean) {
    const key = (points: readonly number[]) => kind + '/' + (ordered ? points : [...points].sort((a,b) => a-b)).join(',')
    marks.set(key(path), key(path.map(opposite)))
  }
  function boundaries(groups: readonly (readonly number[])[], cage: boolean) {
    const owner = new Int16Array(81).fill(-1)
    groups.forEach((g, n) => g.forEach(i => { owner[i] = n }))
    for (const [a,b] of edges) {
      if (cage ? owner[a] >= 0 && owner[a] === owner[b] : owner[a] !== owner[b]) geometry('edge', [a,b], false)
    }
  }
  if (puzzle.regions?.type === 'jigsaw') boundaries(puzzle.regions.regions, false)
  for (const rule of puzzle.rules ?? []) {
    switch (rule.type) {
      case 'killer-cages': boundaries(rule.cages.map(c => c.cells), true); break
      case 'thermometer': geometry('thermo', rule.cells, true); break
      case 'arrow': geometry('arrow', [rule.circle, ...rule.cells], true); break
      case 'kropki':
        for (const p of rule.consecutive?.pairs ?? []) geometry('white', p, false)
        for (const p of rule.ratioTwo?.pairs ?? []) geometry('black', p, false)
        break
    }
  }
  return marks
}

export function layoutPairing(puzzle: VariantPuzzle) {
  const marks = clueShapes(puzzle)
  const given = givenPairing(puzzle.givens)
  const shapes = marks.size ? [...marks.values()].filter(key => marks.has(key)).length / marks.size : null
  const layers = [given, shapes].filter((s): s is number => s !== null)
  return { given, shapes, score: layers.length ? layers.reduce((a,b) => a+b) / layers.length : 0 }
}

/** Merge connected cages in mirrored pairs, then split a noncentral cage on one side. */
export function killerCages(seed: number) {
  const pick = randomIndex(seed)
  const groups = new Map(cells.map(i => [i, [i]]))
  const owner = [...cells]
  function join(a: number, b: number) {
    const merged = [...groups.get(a)!, ...groups.get(b)!]
    groups.set(a, merged)
    groups.delete(b)
    for (const i of merged) owner[i] = a
  }
  const middle = pick(2) ? 39 : 31
  join(40, middle)
  join(40, opposite(middle))
  const target = 25 + 2 * pick(5)
  while (groups.size > target) {
    const possible = edges.filter(([i,j]) => {
      const a = owner[i], b = owner[j], c = owner[opposite(i)], d = owner[opposite(j)]
      return new Set([a,b,c,d]).size === 4 && groups.get(a)!.length + groups.get(b)!.length <= 5
    })
    if (!possible.length) break
    const singles = possible.filter(([a,b]) => groups.get(owner[a])!.length === 1 || groups.get(owner[b])!.length === 1)
    const pool = singles.length && pick(4) !== 0 ? singles : possible
    const [a,b] = pool[pick(pool.length)]
    join(owner[a], owner[b])
    join(owner[opposite(a)], owner[opposite(b)])
  }
  const cages = [...groups.values()]
  const candidates = cages.filter(c => !c.includes(40) && c.length >= 3)
  if (candidates.length) {
    const c = candidates[pick(candidates.length)]
    // A leaf can be split off without disconnecting the remainder.
    const leaf = c.find(i => neighbors[i].filter(j => c.includes(j)).length === 1)
    if (leaf !== undefined) {
      c.splice(c.indexOf(leaf), 1)
      cages.push([leaf])
    }
  }
  return cages
}

/** Trade boundary cells in opposite regions. Every accepted trade preserves size and connectivity. */
export function jigsawRegions(seed: number) {
  const pick = randomIndex(seed)
  const labels = cells.map(i => 3 * Math.floor(i / 27) + Math.floor(i % 9 / 3))
  function connected(region: number) {
    const start = labels.indexOf(region)
    const seen = new Set([start])
    for (const i of seen) for (const j of neighbors[i]) if (labels[j] === region) seen.add(j)
    return seen.size === 9
  }
  const target = 4 + pick(4)
  let trades = 0
  for (let attempt = 0; trades <= target && attempt < 240; attempt++) {
    const a = pick(81), other = neighbors[a].filter(i => labels[i] !== labels[a])
    if (!other.length) continue
    const region = labels[other[pick(other.length)]]
    const options = cells.filter(i => labels[i] === region && neighbors[i].some(j => labels[j] === labels[a]))
    const b = options[pick(options.length)]
    const swaps = [[a,b]]
    if (trades < target) {
      if (new Set([a,b,opposite(a),opposite(b)]).size !== 4) continue
      swaps.push([opposite(a), opposite(b)])
    }
    const changed = new Set(swaps.flatMap(pair => pair.map(i => labels[i])))
    const swap = () => { for (const [i,j] of swaps) [labels[i], labels[j]] = [labels[j], labels[i]] }
    swap()
    if ([...changed].every(connected)) trades++
    else swap()
  }
  return Array.from({ length: 9 }, (_, r) => cells.filter(i => labels[i] === r))
}

/** Choose short lines whose printed direction is valid on both sides of a known solution. */
export function pairedLines(variant: Extract<PlayableVariant, 'arrow' | 'thermometer'>, seed: number, solution: string, count: number): VariantRule[] {
  const pick = randomIndex(seed)
  const digits = [...solution].map(Number)
  const valid = ([a,b,c]: number[]) => variant === 'arrow' ? digits[a] === digits[b] + digits[c] : digits[a] < digits[b] && digits[b] < digits[c]
  const pairs: number[][] = [], singles: number[][] = []
  for (const a of cells) for (const b of lineNeighbors[a]) for (const c of lineNeighbors[b]) {
    const path = [a,b,c]
    if (c === a || !valid(path)) continue
    singles.push(path)
    if (a < 40 && new Set([...path, ...path.map(opposite)]).size === 6 && valid(path.map(opposite))) pairs.push(path)
  }
  const used = new Set<number>(), paths: number[][] = []
  function add(path: number[]) {
    paths.push(path)
    for (const i of path) used.add(i)
  }
  function collect(pool: number[][], mirror: boolean) {
    for (let end = pool.length; end > 0 && paths.length + Number(mirror) < count; end--) {
      const i = pick(end), path = pool[i]
      pool[i] = pool[end - 1]
      if (path.some(j => used.has(j) || mirror && used.has(opposite(j)))) continue
      add(path)
      if (mirror) add(path.map(opposite))
    }
  }
  collect(pairs, true)
  collect(singles, false)
  return paths.map(cells => variant === 'arrow'
    ? { type: 'arrow', circle: cells[0], cells: cells.slice(1) }
    : { type: 'thermometer', cells })
}
