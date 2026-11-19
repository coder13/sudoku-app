import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import worker from '../../cloudflare/pages/_worker.js'

type SyncEvents = {
  getByName(library: string): {
    fetch(request: Request): Response
    notify(message: string, device?: string): void
  }
}

// Run the production Worker's SQL against an isolated SQLite database. D1
// batches commit or roll back as a unit, including single-use ticket redemption.
export function syncDatabase(SYNC_EVENTS?: SyncEvents) {
  const sqlite = new DatabaseSync(':memory:')
  const migrations = new URL('../../cloudflare/migrations/', import.meta.url)
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'))
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
  const fetcher = async (path: string | URL | Request, options?: RequestInit): Promise<Response> => {
    const pending: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => { pending.push(task) } }
    const request = new Request(new URL(String(path), 'https://sudoku.example'), options)
    const response = await worker.fetch(request, { DB, SYNC_EVENTS }, ctx)
    await Promise.all(pending)
    return response
  }
  return { sqlite, fetcher }
}
