import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from '../cloudflare/pages/_worker.js'

const request = (path: string, options?: RequestInit) =>
  worker.fetch(new Request(`https://sudoku.example/api/v1/import/${path}`, options), {}, {})

test('the worker extracts published codes only from fixed provider URLs', async (context) => {
  const responses = [
    new Response('<script>var code = "SCv7_32_102aa"</script><meta content="SCv7_32_102aa">'),
    new Response(' sclN4TEST+K= '),
  ]
  const fetcher = context.mock.method(globalThis, 'fetch', async () => responses.shift()!)
  assert.deepEqual(await (await request('sudoku-coach/Ab12')).json(), { code: 'SCv7_32_102aa' })
  assert.deepEqual(await (await request('sudokupad/abcde12345')).json(), { code: 'sclN4TEST+K=' })
  assert.deepEqual(fetcher.mock.calls.map(call => call.arguments[0]), [
    'https://sudoku.coach/en/s/Ab12', 'https://sudokupad.app/api/puzzle/abcde12345',
  ])
  assert.equal(fetcher.mock.calls[0].arguments[1]?.redirect, 'manual')
  assert.equal((await request('other/Ab12')).status, 404)
  assert.equal((await request('sudoku-coach/Ab12/extra')).status, 404)
  assert.equal((await request('sudokupad/Ab%2f12')).status, 404)
  assert.equal((await request('sudokupad/Ab12', { method: 'POST' })).status, 405)
  assert.equal(fetcher.mock.callCount(), 2)
})

test('the Pages worker does not follow a redirect from a published provider', async ({ mock }) => {
  const fetcher = mock.method(globalThis, 'fetch', async () =>
    new Response(null, { status: 302, headers: { Location: 'https://another.example/puzzle' } }))
  assert.equal((await request('sudokupad/Ab12')).status, 502)
  assert.equal(fetcher.mock.callCount(), 1)
})

test('the worker bounds stream reads and rejects ambiguous or unavailable sources', async (context) => {
  let cancelled = false
  const chunk = new Uint8Array(14_000)
  const large = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(chunk) },
    cancel() { cancelled = true },
  }))
  const responses = [
    large,
    new Response('SCv7_32_102aa SCv7_32_102ab'),
    new Response(null, { status: 404 }),
  ]
  context.mock.method(globalThis, 'fetch', async () => responses.shift()!)
  assert.equal((await request('sudokupad/oversized')).status, 413)
  assert.equal(cancelled, true)
  assert.equal((await request('sudoku-coach/Dupe')).status, 422)
  assert.equal((await request('sudoku-coach/Lost')).status, 404)
})

test('Coach publication metadata belongs to the requested puzzle and preserves authored-rule boundaries', async ({ mock }) => {
  const code = 'SCv7_32_102aa'
  const publication = {
    sudoku_id: 'Ab12', sudoku: code, name: '  Puzzle title  ',
    description: '', blocked: false, custom_constraints: false,
  }
  const page = (specificSudoku: object) => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'
  const pages = [
    page(publication),
    page({ ...publication, description: 'Digits in colored cells have different values.' }),
    page({ ...publication, custom_constraints: true }),
    page({ ...publication, sudoku_id: 'Other' }),
    page({ ...publication, blocked: true }),
    page({ ...publication, description: null }),
    page(publication) + page(publication),
  ]
  mock.method(globalThis, 'fetch', async () => new Response(pages.shift()!))
  assert.deepEqual(await (await request('sudoku-coach/Ab12')).json(),
    { code, coach: { title: 'Puzzle title', hasAuthorInstructions: false } })
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await (await request('sudoku-coach/Ab12')).json(),
      { code, coach: { title: 'Puzzle title', hasAuthorInstructions: true } })
  }
  while (pages.length) assert.deepEqual(await (await request('sudoku-coach/Ab12')).json(), { code })
})
