// Change a completed grid by swapping two digits on a closed group of cells.
// Each touched row, column and box contains both digits. Then edit cage borders
// and recompute all sums before grading the resulting empty-grid Killer.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomIndex } from '../../src/sudoku/sinclair-layout.ts'
import { catalogSeed, worker, score, type Candidate } from './catalog-worker.mts'
import type { VariantPuzzle, Difficulty } from '../../src/sudoku/engine.ts'

const [dir, jobs = '2', quota = '140', target] = process.argv.slice(2)
const output = join(dir, 'cage-trades.jsonl'), cursorFile = join(dir, 'trade-cursor.txt')
const tiers: Difficulty[] = ['hard', 'very-hard', 'master']
const counts = new Map(tiers.map(t => [t, 0])), known = new Set<string>(), shapes = new Set<string>()
let lastAccepted = -1
const cells = Array.from({ length: 81 }, (_, i) => i)
const neighbors = cells.map(i => cells.filter(j => Math.abs(i%9-j%9) + Math.abs(Math.floor(i/9)-Math.floor(j/9)) === 1))
const houses = cells.map(i => [Math.floor(i/9), i%9 + 9, 18 + 3*Math.floor(i/27) + Math.floor(i%9/3)])
const peers = cells.map(i => cells.filter(j => i !== j && houses[i].some(h => houses[j].includes(h))))
type Parent = { solution: string; groups: number[][]; tier: Difficulty }
const parents: Parent[] = [], proven: Parent[] = []
function groupsOf(puzzle: VariantPuzzle) {
  const rule = puzzle.rules?.find(r => r.type === 'killer-cages')
  if (rule?.type !== 'killer-cages') throw Error('Missing cages')
  return rule.cages.map(c => [...c.cells])
}
function connectedParts(group: number[]) {
  const left = new Set(group), parts: number[][] = []
  for (const first of left) {
    const piece = [first]
    left.delete(first)
    for (const cell of piece) for (const next of neighbors[cell]) if (left.delete(next)) piece.push(next)
    parts.push(piece)
  }
  return parts
}
function borders(groups: number[][]) { return groups.map(g => [...g].sort((a,b) => a-b).join(',')).sort().join('/') }
function parent(puzzle: VariantPuzzle, solution: string, tier: Difficulty): Parent {
  const groups = groupsOf(puzzle).flatMap(g => [
    ...g.filter(c => puzzle.givens[c] !== '0').map(c => [c]), ...connectedParts(g.filter(c => puzzle.givens[c] === '0'))])
  return { groups, solution, tier }
}
function record(r: Candidate) {
  lastAccepted = Math.max(lastAccepted,r.index)
  counts.set(r.tier, counts.get(r.tier)! + 1)
  known.add(r.answerKey)
  shapes.add(borders(groupsOf(r.puzzle)))
  proven.push(parent(r.puzzle,r.solution,r.tier))
}
const solver = worker()
try {
  const first = JSON.parse(readFileSync('src/sudoku/collections/sinclair-killer.json','utf8'))
  for (const r of first) if (tiers.includes(r.difficulty)) {
    const trace = await solver.call({ op:'trace', puzzle:r.puzzle })
    if (trace.status === 'solved') proven.push(parent(r.puzzle, trace.solution, r.difficulty))
  }
} finally { solver.close() }
for (const line of readFileSync(join(dir, 'candidates.jsonl'), 'utf8').trim().split('\n')) {
  const r = JSON.parse(line)
  if (r.family === 'killer-cages' && tiers.includes(r.tier)) parents.push(parent(r.puzzle, r.solution, r.tier))
}
if (existsSync(output)) for (const line of readFileSync(output, 'utf8').trim().split('\n').filter(Boolean)) record(JSON.parse(line))
// Convert the new independently sampled parents before editing any of their cells.
// Each connected piece gets its own total. Splitting a cage can change its grade.
const converted = new Set<string>()
const convertFile = join(dir, 'cage-conversions.jsonl')
if (existsSync(convertFile)) for (const s of readFileSync(convertFile,'utf8').trim().split('\n').filter(Boolean)) {
  const r: Candidate = JSON.parse(s)
  converted.add(r.solution)
  proven.push(parent(r.puzzle,r.solution,r.tier))
}
const checker = worker()
try {
  for (const [i,p] of parents.entries()) {
    if (converted.has(p.solution)) continue
    const cages = p.groups.map(cells=>({cells,sum:cells.reduce((sum,c)=>sum+Number(p.solution[c]),0)}))
    const raw = await checker.call({op:'catalog',family:'killer-cages',tier:'any',wanted:tiers,seed:i,max:0,mask:'0'.repeat(81),
      template:{version:1,givens:p.solution,rules:[{type:'killer-cages',coverGrid:true,cages}]}})
    if (raw) {
      const r = score('killer-cages',raw.tier,i,i,raw)
      proven.push(parent(r.puzzle,r.solution,r.tier))
      appendFileSync(convertFile,JSON.stringify(r) + '\n')
    }
  }
} finally { checker.close() }
let cursor = Math.max(lastAccepted + 1, existsSync(cursorFile) ? Number(readFileSync(cursorFile, 'utf8')) : 0)
function trade(board: string[], pick: (n:number) => number, groups: number[][], gentle: boolean) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = String(1+pick(9)), b = String(1+pick(9))
    if (a === b) continue
    const first = cells.filter(i => board[i] === a)[pick(9)], component = new Set([first])
    for (const i of component) for (const j of peers[i]) if (board[j] === a || board[j] === b) component.add(j)
    if (component.size === 18 || gentle && component.size > 8) continue
    if (gentle && groups.some(g => {
      const x = g.find(i=>board[i] === a), y = g.find(i=>board[i] === b)
      return x !== undefined && y !== undefined && component.has(x) !== component.has(y)
    })) continue
    for (const i of component) board[i] = board[i] === a ? b : a
    return true
  }
  return false
}
function child(base: Parent, pick: (n:number)=>number) {
  const board = [...base.solution]
  let traded = false
  const gentle = pick(5) !== 0
  for (let n = gentle ? 1 : 2 + pick(3); n > 0; n--) traded = trade(board, pick, base.groups, gentle) || traded
  if (!traded) return
  let groups = base.groups.flatMap(g => {
    const seen = new Set<string>(), repeated: number[][] = [], keep: number[] = []
    for (const i of g) {
      if (seen.has(board[i])) repeated.push([i])
      else { seen.add(board[i]); keep.push(i) }
    }
    return [...repeated, ...connectedParts(keep)]
  })
  const owner = new Int16Array(81)
  groups.forEach((g, n) => g.forEach(i => { owner[i] = n }))
  // Move a boundary cell while keeping each cage connected and free of repeated digits.
  for (let moves = gentle ? 1 : 2 + pick(3), tries = 0; moves && tries < 70; tries++) {
    const a = pick(81), b = neighbors[a][pick(neighbors[a].length)], s = owner[a], t = owner[b]
    if (s === t || groups[t].length >= 6 || groups[t].some(i => board[i] === board[a])) continue
    const left = groups[s].filter(i => i !== a)
    if (connectedParts(left).length > 1) continue
    groups[s] = left
    groups[t].push(a)
    owner[a] = t
    moves--
  }
  groups = groups.filter(g => g.length)
  const digits = '123456789'.split('')
  if (!gentle && pick(3) === 0) for (let i = 8; i > 0; i--) {
    const j = pick(i+1)
    ;[digits[i], digits[j]] = [digits[j], digits[i]]
  }
  const solution = board.map(d => digits[Number(d)-1]).join('')
  return { solution, groups, rules: [{ type:'killer-cages', coverGrid:true,
    cages: groups.map(cells => ({ cells, sum:cells.reduce((sum, c)=>sum+Number(solution[c]),0) })) }] }
}
async function lane() {
  const w = worker(4000)
  try { for (;;) {
    const wanted = tiers.filter(t => (!target || t === target) && counts.get(t)! < Number(quota))
    if (!wanted.length) break
    const index = cursor++, seed = catalogSeed('sinclair-cage-trades/1/' + index)
    const pick = randomIndex(seed), eligible = (pick(10) ? proven : parents).filter(p => wanted.includes(p.tier))
    if (!eligible.length) continue
    const proposal = child(eligible[pick(eligible.length)], pick)
    if (index % 1000 === 0) writeFileSync(cursorFile, String(cursor))
    if (!proposal || shapes.has(borders(proposal.groups))) continue
    const raw = await w.call({ op:'catalog', family:'killer-cages', tier:'any', wanted, seed, max:0, nodes:4000, mask:'0'.repeat(81),
      template:{ version:1, givens:proposal.solution, rules:proposal.rules } })
    if (!raw || known.has(raw.answerKey) || counts.get(raw.tier)! >= Number(quota)) continue
    const row = score('killer-cages', raw.tier, seed, index, raw)
    record(row)
    appendFileSync(output, JSON.stringify(row) + '\n')
  } } finally { w.close() }
}
if (Number(quota) > 0) {
  const timer = setInterval(() => console.log(cursor, Object.fromEntries(counts)), 30000)
  try { await Promise.all(Array.from({ length:Number(jobs) }, lane)) }
  finally { clearInterval(timer); writeFileSync(cursorFile,String(cursor)) }
}
