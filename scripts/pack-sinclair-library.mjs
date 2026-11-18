// Package the committed edition for the CDN. A missing source pack fails the build.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { collectionPuzzleData, collectionVariantHash } from '../src/sudoku/collection-data.ts'
import { collectionGridHash } from '../src/sudoku/collection-integrity.ts'
import { VARIANTS, variantDifficulties, isPlayablePuzzle, variantIdForPuzzle } from '../src/sudoku/variants.ts'
import { SINCLAIR_COUNT, definitionOf, libraryId } from '../src/sudoku/sinclair-format.ts'

export async function buildSinclairCatalog(output, generated) {
  const dir = new URL('../data/sinclair/', import.meta.url)
  const techniques = [], variants = {}, answers = new Set()
  for (const family of Object.keys(VARIANTS)) {
    const levels = variants[family] = {}
    const dest = new URL(libraryId(family) + '/', output)
    await mkdir(dest, { recursive: true })
    const ids = new Set()
    for (const tier of variantDifficulties(family)) {
      const source = await readFile(new URL(family + '/' + tier + '.json', dir), 'utf8')
      const pack = JSON.parse(source)
      if (pack.edition !== 1 || pack.variant !== family || pack.difficulty !== tier || pack.puzzles.length !== SINCLAIR_COUNT ||
          !Number.isSafeInteger(pack.scoringVersion) || !pack.order.length) throw Error('Invalid Sinclair pack ' + family + '/' + tier)
      const rows = pack.puzzles.map(row => {
        const [grid, answer, key, points, hardest, path, opening] = row
        const puzzle = definitionOf(row), classic = typeof grid === 'string'
        if (classic !== (family === 'classic') || !/^[0-9]{81}$/.test(puzzle.givens) || !/^[1-9]{81}$/.test(answer) ||
            !/^[1-9]{81}$/.test(key) || answers.has(key) || !Number.isSafeInteger(points) || points <= 0 ||
            !pack.order[hardest] || !path.length || !path.every(i => pack.order[i]) || !pack.openings[opening] ||
            [...puzzle.givens].some((d,i) => d !== '0' && d !== answer[i]) ||
            !classic && (!isPlayablePuzzle(family, puzzle) || variantIdForPuzzle(puzzle) !== family)) throw Error('Invalid Sinclair row ' + family + '/' + tier)
        answers.add(key)
        const givensHash = collectionGridHash(puzzle.givens), variantHash = classic ? null : collectionVariantHash(puzzle)
        const id = variantHash ?? givensHash
        if (ids.has(id)) throw Error('Repeated Sinclair puzzle ID ' + id)
        ids.add(id)
        const technique = pack.order[hardest]
        if (!techniques.includes(technique)) techniques.push(technique)
        const data = collectionPuzzleData({ givens: puzzle.givens, puzzle: classic ? undefined : puzzle })
        return [givensHash, variantHash, points, techniques.indexOf(technique), Buffer.byteLength(data)]
      })
      const body = JSON.stringify(pack)
      const hash = createHash('sha256').update(body).digest('hex')
      await writeFile(new URL(tier + '-' + hash + '.json', dest), body)
      levels[tier] = { hash, checksum: collectionGridHash(body), bytes: Buffer.byteLength(body), version: pack.scoringVersion, rows }
    }
  }
  await writeFile(new URL('sinclair-index.json', generated), JSON.stringify({ techniques, variants }))
}
