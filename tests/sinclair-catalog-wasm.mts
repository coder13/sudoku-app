import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import '../docs/research/sudoku-construction/engine.mts'
import { dealSinclair } from '../src/sudoku/sinclair-deal.ts'
import { historyKey } from '../src/sudoku/sinclair-history.ts'
import { libraryLevel } from '../src/sudoku/sinclair-catalog.ts'
import { definitionOf, libraryId, puzzleCode, type SinclairPack } from '../src/sudoku/sinclair-format.ts'
import { makeGame, type Game } from '../src/sudoku/game.ts'
import { MemoryStorage } from './helpers/memory-storage.ts'

test('a real New Puzzle deal excludes a transformed legacy answer and remembers a removed game',async () => {
  const level = libraryLevel('classic','impossible'), body = readFileSync(new URL('../public'+level.url,import.meta.url),'utf8')
  const pack:SinclairPack=JSON.parse(body), ids=level.rows.map(([g])=>puzzleCode('impossible',g))
  const original=definitionOf(pack.puzzles[0]).givens
  const transposed=Array.from({length:81},(_,i)=>original[(i%9)*9+Math.floor(i/9)]).map(d=>d==='0'?d:String(10-Number(d))).join('')
  const games:Game[]=[makeGame('old','An older import',transposed,'imported')]
  const local=new MemoryStorage(), requests:string[]=[]
  local.setItem(historyKey('classic','impossible'),JSON.stringify(ids.slice(2)))
  Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true})
  const oldFetch=globalThis.fetch
  globalThis.fetch=async url=>{ requests.push(String(url)); return new Response(body) }
  try {
    await dealSinclair('classic','impossible',17,true,[],()=>games,g=>games.push(g),new AbortController().signal)
    const game=games.pop()!
    assert.deepEqual(game.collection,{collectionId:libraryId('classic'),puzzleId:ids[1]})
    assert.equal(game.difficulty,'impossible')
    assert.equal(game.generatedWithAuto,true)
    assert.equal(game.ratingAttempt?.grade.points,pack.puzzles[1][3])
    assert.equal(game.generationStyle,'sinclair')
    await assert.rejects(dealSinclair('classic','impossible',18,false,undefined,()=>games,g=>games.push(g),new AbortController().signal),/seen every available/)
    assert.deepEqual(requests,[level.url])
  } finally {
    globalThis.fetch=oldFetch
    Reflect.deleteProperty(globalThis,'localStorage')
  }
})
