import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

export type CoachSolutionSource = { code: string; solution: string; references: string[] }

export const standaloneCoachSolutionSources = new Set([
  'coach-calcudoku.json:$',
  'modular-coach.json:$.examples[6]',
  'sudoku-coach-boxless-diagonal.json:$',
  'sudoku-coach-boxless-modular.json:$',
])

export function readCoachSolutionSources() {
  const fixtureRoot = new URL('../fixtures/', import.meta.url)
  const fixturePath = new URL(fixtureRoot).pathname
  const sources = new Map<string, CoachSolutionSource>()

  function collect(value: unknown, file: string, keyPath = '$') {
    if (!value || typeof value !== 'object') return
    if (!Array.isArray(value)) {
      const record = value as Record<string, unknown>
      if (typeof record.code === 'string' && record.code.startsWith('SCv') && typeof record.solution === 'string') {
        const source = sources.get(record.code) ?? { code: record.code, solution: record.solution, references: [] }
        source.references.push(`${file}:${keyPath}`)
        if (source.solution !== record.solution) throw new Error(`Repeated Coach source has differing solutions: ${file}:${keyPath}`)
        sources.set(record.code, source)
      }
    }
    if (Array.isArray(value)) value.forEach((item, index) => collect(item, file, `${keyPath}[${index}]`))
    else for (const [key, item] of Object.entries(value)) collect(item, file, `${keyPath}.${key}`)
  }

  for (const name of readdirSync(fixturePath).filter(name => name.endsWith('.json')).sort()) {
    const path = join(fixturePath, name)
    collect(JSON.parse(readFileSync(path, 'utf8')), relative(fixturePath, path))
  }

  return sources
}
