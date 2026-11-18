import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../../cloudflare/pages/_worker.js'

// Run the production Worker's SQL against an isolated SQLite database. D1
// batches commit or roll back as a unit, including single-use ticket redemption.
export function syncDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../cloudflare/migrations/0001_device_sync.sql', import.meta.url), 'utf8'))
  const prepare = (sql: string, values: (number | string | null)[] = []) => ({
    bind: (...args: typeof values) => prepare(sql, args),
    first(column?: string) {
      const row = sqlite.prepare(sql).get(...values)
      return column ? row?.[column] : row ?? null
    },
    all: () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: () => ({ meta: sqlite.prepare(sql).run(...values) }),
  })
  const DB = {
    prepare,
    batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN')
      try { const results = statements.map(s => s.run()); sqlite.exec('COMMIT'); return results }
      catch (e) { sqlite.exec('ROLLBACK'); throw e }
    },
  }
  const fetcher = async (path: string | URL | Request, options?: RequestInit): Promise<Response> =>
    worker.fetch(new Request(new URL(String(path), 'https://sudoku.example'), options), { DB })
  return { sqlite, fetcher }
}
