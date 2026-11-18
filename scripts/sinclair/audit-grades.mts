// Replay the shipped web engine against each actual download and its published grade.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { digest, wasmSha256 } from '../../docs/research/sudoku-construction/engine.mts'
import { runEngine } from '../../src/sudoku/engine.ts'
import { definitionOf, type SinclairPack } from '../../src/sudoku/sinclair-format.ts'

const [dir, output, shard = '0', shards = '1'] = process.argv.slice(2)
const files = readdirSync(dir).sort().flatMap(family => readdirSync(join(dir,family)).sort().map(name => join(family,name)))
const previous = existsSync(output) ? JSON.parse(readFileSync(output,'utf8')) : undefined
const groups: {file:string;sha256:string;count:number}[] = []
for (const file of files.filter((_,i) => i % Number(shards) === Number(shard))) {
  const source = readFileSync(join(dir,file),'utf8'), pack: SinclairPack = JSON.parse(source)
  const sha256 = digest(source)
  const cached = previous?.wasmSha256 === wasmSha256 && previous.groups.find((r:{file:string;sha256:string})=>r.file===file && r.sha256===sha256)
  if (cached) { groups.push(cached); continue }
  for (const row of pack.puzzles) {
    const puzzle = definitionOf(row)
    const rating = pack.variant === 'classic'
      ? await runEngine({type:'rate', values:puzzle.givens, techniqueOrder:pack.order})
      : await runEngine({type:'variant', operation:'rate', position:{puzzle}, techniqueOrder:pack.order})
    const score = 'score' in rating ? rating.score : rating
    assert.deepEqual(rating.status,{solved:pack.difficulty},file)
    assert.equal(score.hardest,pack.order[row[4]],file)
    assert.equal(score.points,row[3],file)
    assert.equal(rating.scoringVersion,pack.scoringVersion,file)
    if (pack.variant === 'classic') assert.ok(await runEngine({type:'accepts-difficulty', values:puzzle.givens, difficulty:pack.difficulty}),file)
  }
  const keys = await runEngine({type:'canonical-puzzles', values:pack.puzzles.map(r=>r[1])})
  assert.deepEqual(keys,pack.puzzles.map(r=>r[2]),file)
  groups.push({file,sha256,count:pack.puzzles.length})
  console.log(file)
  writeFileSync(output+'.tmp',JSON.stringify({wasmSha256,groups},null,2)+'\n')
  renameSync(output+'.tmp',output)
}
writeFileSync(output,JSON.stringify({wasmSha256,groups},null,2)+'\n')
