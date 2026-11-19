import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const origin = 'https://sudoku.example'
const shellAssets = ['/index.html', '/learn/full-house/index.html', '/assets/app.js', '/assets/engine.wasm']

async function workerHarness({ failInstall = false } = {}) {
  const source = await readFile(new URL('../scripts/worker.js', import.meta.url), 'utf8')
  const handlers = new Map<string, (event: any) => void>()
  const contents = new Map<string, Map<string, Response>>()
  const deleted: string[] = []
  const installed: Request[] = []
  const fetched: unknown[] = []
  let skipped = 0
  let claimed = 0
  const cacheName = 'sudoku-app-shell-current'
  const caches = {
    async open(name: string) {
      if (!contents.has(name)) contents.set(name, new Map())
      const cache = contents.get(name)!
      return {
        async addAll(requests: Request[]) {
          installed.push(...requests)
          if (failInstall) throw new Error('Network unavailable during installation')
          for (const request of requests) cache.set(new URL(request.url).pathname, new Response('cached:' + new URL(request.url).pathname))
        },
        async match(path: string) { return cache.get(path)?.clone() },
      }
    },
    async keys() { return [...contents.keys()] },
    async delete(name: string) { deleted.push(name); return contents.delete(name) },
  }
  runInNewContext(`const cacheName = ${JSON.stringify(cacheName)}; const assets = ${JSON.stringify(shellAssets)};\n${source}`, {
    URL,
    Request: class extends Request {
      constructor(path: string, options: RequestInit) { super(new URL(path, origin), options) }
    },
    caches,
    fetch: async (request: unknown) => { fetched.push(request); return new Response('network') },
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: any) => void) => { handlers.set(name, handler) },
      skipWaiting: () => { skipped++ },
      clients: { claim: async () => { claimed++ } },
    },
  })
  async function lifecycle(name: string) {
    let pending: Promise<unknown> | undefined
    handlers.get(name)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    assert.ok(pending, name + ' must extend its event lifetime')
    await pending
  }
  async function request(path: string, mode = 'cors', method = 'GET') {
    const input = { url: new URL(path, origin).href, mode, method }
    let pending: Promise<Response> | undefined
    handlers.get('fetch')!({ request: input, respondWith: (promise: Promise<Response>) => { pending = promise } })
    return { input, response: pending && await pending }
  }
  return { cacheName, contents, deleted, installed, fetched, lifecycle, request,
    message: (data: unknown) => handlers.get('message')!({ data }),
    counts: () => ({ skipped, claimed }) }
}

test('offline worker installs a complete revision and activates only after an explicit update message', async () => {
  const worker = await workerHarness()
  await worker.lifecycle('install')
  assert.deepEqual(worker.installed.map(request => new URL(request.url).pathname), ['/', '/learn/full-house/', '/assets/app.js', '/assets/engine.wasm'])
  assert.ok(worker.installed.every(request => request.cache === 'reload'))
  assert.deepEqual(worker.counts(), { skipped: 0, claimed: 0 })
  for (const data of [undefined, {}, { type: 'UPDATE' }]) worker.message(data)
  assert.equal(worker.counts().skipped, 0)
  worker.message({ type: 'SKIP_WAITING' })
  assert.equal(worker.counts().skipped, 1)
  await worker.lifecycle('activate')
  assert.equal(worker.counts().claimed, 1)
})

test('offline navigation uses cached root/deep-route shells even when search parameters change', async () => {
  const worker = await workerHarness()
  await worker.lifecycle('install')
  for (const [path, expected] of [
    ['/', '/'],
    ['/?puzzle=phone-save', '/'],
    ['/learn/full-house', '/learn/full-house/'],
    ['/learn/full-house/?step=2', '/learn/full-house/'],
    ['/assets/app.js?v=2', '/assets/app.js'],
    ['/assets/engine.wasm', '/assets/engine.wasm'],
  ]) {
    const { response } = await worker.request(path, path.startsWith('/assets/') ? 'cors' : 'navigate')
    assert.equal(await response?.text(), 'cached:' + expected, path)
  }
  assert.deepEqual(worker.fetched, [])
})

test('offline worker leaves collection downloads, external resources, writes, and unknown routes to the network', async () => {
  const worker = await workerHarness()
  await worker.lifecycle('install')
  for (const [path, mode, method] of [
    ['/collections/nikoli/puzzle.txt', 'cors', 'GET'],
    ['https://external.example/assets/app.js', 'cors', 'GET'],
    ['/assets/app.js', 'cors', 'POST'],
    ['/api/v1/changes?after=0', 'cors', 'GET'],
    ['/learn/not-a-route', 'navigate', 'GET'],
  ]) {
    assert.equal((await worker.request(path, mode, method)).response, undefined, path)
  }
  worker.contents.get(worker.cacheName)!.delete('/assets/app.js')
  const missing = await worker.request('/assets/app.js?v=2')
  assert.equal(await missing.response?.text(), 'network')
  assert.equal(worker.fetched[0], missing.input, 'fallback preserves the original request')
})

test('activation removes only obsolete app shells and failed installation preserves the previous revision', async () => {
  const worker = await workerHarness()
  for (const name of ['sudoku-app-shell-old', 'gridroom-shell-old', 'unrelated-cache']) worker.contents.set(name, new Map())
  await worker.lifecycle('install')
  await worker.lifecycle('activate')
  assert.deepEqual(worker.deleted.sort(), ['gridroom-shell-old', 'sudoku-app-shell-old'])
  assert.ok(worker.contents.has(worker.cacheName))
  assert.ok(worker.contents.has('unrelated-cache'))

  const interrupted = await workerHarness({ failInstall: true })
  interrupted.contents.set('sudoku-app-shell-previous', new Map([['/index.html', new Response('previous')]]))
  await assert.rejects(interrupted.lifecycle('install'), /Network unavailable/)
  assert.deepEqual(interrupted.deleted, [])
  assert.deepEqual(interrupted.counts(), { skipped: 0, claimed: 0 })
  assert.equal(await interrupted.contents.get('sudoku-app-shell-previous')!.get('/index.html')!.text(), 'previous')
})

test('the offline build revisions every shell asset while excluding source maps and optional collection grids', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sudoku-offline-uat-'))
  const build = promisify(execFile)
  try {
    await mkdir(join(directory, 'scripts'), { recursive: true })
    await mkdir(join(directory, 'dist/client/assets'), { recursive: true })
    await mkdir(join(directory, 'dist/client/collections'), { recursive: true })
    await mkdir(join(directory, 'dist/client/learn/full-house'), { recursive: true })
    await copyFile(new URL('../scripts/build-offline.mjs', import.meta.url), join(directory, 'scripts/build-offline.mjs'))
    await copyFile(new URL('../scripts/worker.js', import.meta.url), join(directory, 'scripts/worker.js'))
    await Promise.all([
      writeFile(join(directory, 'dist/client/index.html'), '<html>root</html>'),
      writeFile(join(directory, 'dist/client/learn/full-house/index.html'), '<html>lesson</html>'),
      writeFile(join(directory, 'dist/client/assets/app.js'), 'app version one'),
      writeFile(join(directory, 'dist/client/assets/engine.wasm'), new Uint8Array([0, 97, 115, 109])),
      writeFile(join(directory, 'dist/client/assets/app.js.map'), 'source map'),
      writeFile(join(directory, 'dist/client/collections/puzzle.txt'), 'optional grid'),
    ])
    const script = join(directory, 'scripts/build-offline.mjs')
    const output = join(directory, 'dist/client/sw.js')
    await build(process.execPath, [script])
    const original = await readFile(output, 'utf8')
    assert.match(original, /\/learn\/full-house\/index\.html/)
    assert.match(original, /\/assets\/engine\.wasm/)
    assert.doesNotMatch(original, /app\.js\.map|\/collections\/puzzle\.txt|"\/sw\.js"/)
    await build(process.execPath, [script])
    assert.equal(await readFile(output, 'utf8'), original, 'an unchanged build has a stable revision')
    await writeFile(join(directory, 'dist/client/assets/app.js'), 'app version two')
    await build(process.execPath, [script])
    assert.notEqual((await readFile(output, 'utf8')).split('\n')[0], original.split('\n')[0], 'changed shell content invalidates the revision')
    await writeFile(join(directory, 'dist/client/collections/puzzle.txt'), 'changed optional grid')
    const beforeOptionalChange = await readFile(output, 'utf8')
    await build(process.execPath, [script])
    assert.equal(await readFile(output, 'utf8'), beforeOptionalChange, 'optional grids do not force a shell update')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

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
