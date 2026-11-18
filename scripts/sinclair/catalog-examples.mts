import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {join} from 'node:path'
import {digest} from '../../docs/research/sudoku-construction/engine.mts'
import {generateClassic} from '../../src/sudoku/classic-generation.ts'
import {generatePlayableVariant} from '../../src/sudoku/variant-play.ts'
import {definitionOf,type SinclairPack} from '../../src/sudoku/sinclair-format.ts'
import {layoutPairing} from '../../src/sudoku/sinclair-layout.ts'
import {detectPuzzle} from '../../src/sudoku/puzzle-import.ts'
import {VARIANTS,type VariantId} from '../../src/sudoku/variants.ts'
import {DIFFICULTY_LABELS} from '../../src/sudoku/difficulty.ts'
import type {Difficulty,VariantPuzzle} from '../../src/sudoku/engine.ts'

const [dir,examples,origin='https://coder13-sudoku.netlify.app']=process.argv.slice(2)
const controls=gunzipSync(readFileSync(join(dir,'standard-sample.jsonl.gz'))).toString().trim().split('\n').map(s=>JSON.parse(s))
function median(numbers:number[]) {
  const sorted=[...numbers].sort((a,b)=>a-b)
  return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2
}
// Pick a typical layout for each arm. Points decide ties.
function representative<T extends {pairing:number;points:number}>(rows:T[]) {
  const middle=median(rows.map(r=>r.pairing)), points=median(rows.map(r=>r.points))
  return [...rows].sort((a,b)=>Math.abs(a.pairing-middle)-Math.abs(b.pairing-middle) || Math.abs(a.points-points)-Math.abs(b.points-points))[0]
}
const groups:[VariantId,Difficulty][]=[['classic','impossible'],['killer-cages','master'],['jigsaw','medium']]
const sideOrder = groups.map(([family]) => family).sort((a,b) => digest('blind/'+a).localeCompare(digest('blind/'+b)))
const selected=[], key=[]
const lines=['# Which puzzle did you prefer?','',
  'Play both puzzles in one row. Flip a coin to choose which side to play first. Before the first move, record which layout you prefer.',
  'After both solves, record which puzzle you would play again, or a tie. Name one deduction that influenced your choice. The app gives both puzzles the same grade.','',
  'Each link opens a playable puzzle in Gridroom. To use another copy of the app, paste the link into Import a puzzle.','',
  '| Level | Puzzle A | Puzzle B |','| --- | --- | --- |']
for(const [family,tier] of groups) {
  const pack:SinclairPack=JSON.parse(readFileSync(join('data/sinclair',family,tier+'.json'),'utf8'))
  const mine=representative(pack.puzzles.map(row=>({row,pairing:layoutPairing(definitionOf(row)).score,points:row[3]})))
  const other=representative(controls.filter(r=>r.family===family && r.tier===tier && !r.error && r.answer!==digest(mine.row[2])))
  const standard:VariantPuzzle=family==='classic'?{version:1,givens:(await generateClassic(tier,other.seed)).board}
    :(await generatePlayableVariant(family,tier,other.seed,[])).puzzle
  assert.equal(digest(JSON.stringify(standard)),other.id)
  const sinclair=definitionOf(mine.row)
  assert.equal(layoutPairing(standard).score,other.pairing)
  const name=VARIANTS[family].name+' '+DIFFICULTY_LABELS[tier]
  const swap=sideOrder.indexOf(family)%2
  const links=[]
  for(const [i,puzzle] of (swap?[sinclair,standard]:[standard,sinclair]).entries()) {
    const share=origin+'/#'+(family==='classic'?'puzzle='+puzzle.givens:'variant='+encodeURIComponent(JSON.stringify({id:family,puzzle})))
    const imported=await detectPuzzle(share)
    assert.equal(imported.givens,puzzle.givens)
    if(family!=='classic') assert.deepEqual(imported.variant?.puzzle,puzzle)
    links.push('[Play '+(i===0?'A':'B')+']('+share+')')
  }
  lines.push('| '+[name,...links].join(' | ')+' |')
  key.push(name+' has Sinclair on side '+(swap?'A.':'B.'))
  selected.push({family,name,standard:{puzzle:standard,pairing:layoutPairing(standard)},sinclair:{puzzle:sinclair,pairing:layoutPairing(sinclair)}})
}
lines.push('','<details><summary>Reveal the sources</summary>','',...key,'','</details>','')
writeFileSync(join(dir,'play.md'),lines.join('\n'))
writeFileSync(examples,JSON.stringify(selected))
