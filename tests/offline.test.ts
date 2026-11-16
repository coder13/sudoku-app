import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('service worker waits for explicit update approval', async () => {
  const source = await readFile(new URL('../scripts/worker.js', import.meta.url), 'utf8')
  const install = source.slice(source.indexOf("addEventListener('install'"), source.indexOf("addEventListener('message'"))

  assert.doesNotMatch(install, /skipWaiting/)
  assert.match(source, /event\.data\?\.type === 'SKIP_WAITING'/)
  assert.match(source, /self\.skipWaiting\(\)/)
})

test('local development removes stale offline control and reloads once', async () => {
  const source = await readFile(new URL('../src/components/OfflineUpdates.tsx', import.meta.url), 'utf8')

  assert.match(source, /navigator\.serviceWorker\.controller/)
  assert.match(source, /registration\.unregister\(\)/)
  assert.match(source, /if \(controlled\) window\.location\.reload\(\)/)
})
