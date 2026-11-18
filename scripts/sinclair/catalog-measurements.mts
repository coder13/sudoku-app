// Measure the actual published files and compare equal-sized groups at the same level.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync, gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { VARIANTS, variantDifficulties, type VariantId } from '../../src/sudoku/variants.ts'
import { definitionOf, puzzleCode, type SinclairPack } from '../../src/sudoku/sinclair-format.ts'
import { libraryLevel } from '../../src/sudoku/sinclair-catalog.ts'
import { layoutPairing } from '../../src/sudoku/sinclair-layout.ts'
import { puzzleSimilarity, visibleClues } from '../../src/sudoku/sinclair-variety.ts'
import { chooseSinclair } from '../../src/sudoku/sinclair-deal.ts'

const [research, ...controlFiles] = process.argv.slice(2)
if (!research || !controlFiles.length) throw Error('Supply the report directory and all Standard sample files.')
const readRows = (s:string) => s.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s))
const ledger = readRows(gunzipSync(readFileSync(join(research,'selection.jsonl.gz'))).toString())
const normal = controlFiles.flatMap(f => readRows(readFileSync(f,'utf8')))
const docs = (s:string) => join(research,s)
function sizes(bytes:Buffer) {
  return { raw:bytes.length, gzip:gzipSync(bytes,{level:9}).length,
    brotli:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:6}}).length }
}
const mean = (values:number[]) => values.reduce((a,b)=>a+b,0)/values.length
function median(values:number[]) {
  const sorted = [...values].sort((a,b)=>a-b)
  return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2
}
type Measurement = {points:number;steps:number;pairing:number;distance:number;hardest:string;answer:string}
function summary(rows:Measurement[]) {
  return { count:rows.length, answers:new Set(rows.map(r=>r.answer)).size, hardest:new Set(rows.map(r=>r.hardest)).size,
    meanPairing:mean(rows.map(r=>r.pairing)), medianSteps:median(rows.map(r=>r.steps)), medianPoints:median(rows.map(r=>r.points)),
    medianReferenceDistance:median(rows.map(r=>r.distance)), perfectPairing:rows.filter(r=>r.pairing===1).length }
}
const details=[], allRows:Measurement[]=[], families=[], evidence:string[]=[]
for (const family of Object.keys(VARIANTS) as VariantId[]) {
  const familyRows:Measurement[]=[]
  for (const tier of variantDifficulties(family)) {
    if (tier === 'auto') continue
    const level=libraryLevel(family,tier), text=readFileSync('public'+level.url), pack:SinclairPack=JSON.parse(text.toString())
    const seeds=ledger.filter(r=>r.family===family && r.tier===tier)
    const controls=normal.filter(r=>r.family===family && r.tier===tier), returned=controls.filter(r=>!r.error)
    assert.equal(seeds.length,100)
    assert.equal(new Set(controls.map(r=>r.draw)).size,100)
    assert.equal(controls.length,100)
    const rows=pack.puzzles.map((r,i)=>{
      const pairing=layoutPairing(definitionOf(r)).score
      assert.equal(pairing,seeds[i].pairing)
      return {points:r[3],steps:seeds[i].steps,pairing,distance:seeds[i].distance,hardest:pack.order[r[4]],
        answer:createHash('sha256').update(r[2]).digest('hex')}
    })
    allRows.push(...rows); familyRows.push(...rows)
    const styles=pack.puzzles.map(r=>({...visibleClues(definitionOf(r)),hardest:pack.order[r[4]],opening:pack.openings[r[6]]}))
    const pairs:number[]=[]
    for(let i=0;i<100;i++) for(let j=0;j<i;j++) pairs.push(puzzleSimilarity(styles[i],styles[j]))
    const ids=level.rows.map(([g,v])=>puzzleCode(tier,v??g)), dealt:string[]=[], transitions:number[]=[]
    let last=-1
    const empty=new Set<string>()
    for(let n=0;n<100;n++) {
      const i=chooseSinclair(pack,ids,dealt,empty,[],(n+1)*48271)
      if(last!==-1) transitions.push(puzzleSimilarity(styles[i],styles[last]))
      last=i;dealt.push(ids[i])
    }
    details.push({family,tier,sizes:sizes(text),sinclair:summary(rows),normal:summary(returned),
      missed:controls.length-returned.length, emptyStarts:pack.puzzles.filter(r=>/^0{81}$/.test(definitionOf(r).givens)).length,
      randomNeighbor:mean(pairs),browseNeighbor:mean(seeds.slice(1).map(r=>r.similarity)),dealNeighbor:mean(transitions)})
    evidence.push(...rows.map((r,i)=>[family,tier,i+1,r.steps,r.hardest,r.points,r.pairing,r.distance,r.answer].join(',')))
  }
  families.push({family, sinclair:summary(familyRows),normal:summary(normal.filter(r=>r.family===family && !r.error)),
    packs:details.filter(g=>g.family===family).length})
}
const totalKeys = ['raw','gzip','brotli'] as const
const packBytes=Object.fromEntries(totalKeys.map(k=>[k,details.reduce((sum,g)=>sum+g.sizes[k],0)]))
const index=sizes(readFileSync('src/sudoku/generated/sinclair-index.json'))
const result={samples:normal.length,sinclair:summary(allRows),normal:summary(normal.filter(r=>!r.error)),packBytes,index,
  filenames:details.length,minPack:Math.min(...details.map(g=>g.sizes.gzip)),maxPack:Math.max(...details.map(g=>g.sizes.gzip)),
  meanDealNeighbor:mean(details.map(g=>g.dealNeighbor)),meanRandomNeighbor:mean(details.map(g=>g.randomNeighbor)),
  meanBrowseNeighbor:mean(details.map(g=>g.browseNeighbor)),families,groups:details}
writeFileSync(docs('measurements.json'),JSON.stringify(result,null,2)+'\n')
writeFileSync(docs('standard-sample.jsonl.gz'),gzipSync(normal.sort((a,b)=>a.family.localeCompare(b.family)||a.tier.localeCompare(b.tier)||a.draw-b.draw)
  .map(r=>JSON.stringify(r)).join('\n')+'\n',{level:9}))
writeFileSync(docs('puzzle-measurements.csv.gz'),gzipSync('variant,difficulty,number,steps,hardest,points,halfTurnPairing,referenceDistance,answerClassSHA256\n'+evidence.join('\n')+'\n',{level:9}))
