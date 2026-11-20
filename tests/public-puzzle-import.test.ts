import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('the published X-Sums declaration must describe the complete rules', async ({ mock }) => {
  const { metadata } = JSON.parse(readFileSync(new URL('./fixtures/x-sum-unsupported-AsnF.json', import.meta.url), 'utf8'))
  const codes = [
    metadata.description.replaceAll('\n', '\r\n'),
    metadata.description.replace('sum of the first', 'product of the first'),
    metadata.description + '\nRed cells count twice.',
  ]
  mock.method(globalThis, 'fetch', async () => new Response(
    '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: { ...metadata, description: codes.shift() } }) + '</script>'))
  const expected = { code: metadata.sudoku, coach: { title: metadata.name, hasAuthorInstructions: true } }
  assert.deepEqual(await (await request('sudoku-coach/AsnF')).json(),
    { ...expected, coach: { ...expected.coach, authoredRule: 'x-sum' } })
  while (codes.length) assert.deepEqual(await (await request('sudoku-coach/AsnF')).json(), expected)
})


test('a Coach legend can declare already encoded rules without accepting extra instructions', async ({ mock }) => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8'))
  const source = examples.find(({ url }: { url: string }) => url.endsWith('HqJ9'))
  const publication = { sudoku_id: 'HqJ9', sudoku: source.code, name: source.title,
    description: source.description, blocked: false, custom_constraints: false }
  const examplesToCheck = [
    publication,
    { ...publication, description: publication.description + '\nAll black dots are given.' },
    { ...publication, description: publication.description.replace('XIII = 13', 'XIII = 14') },
    { ...publication, custom_constraints: true },
  ]
  mock.method(globalThis, 'fetch', async () => new Response(
    '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: examplesToCheck.shift() }) + '</script>'))
  const expected = { code: source.code, coach: { title: source.title, hasAuthorInstructions: true } }
  assert.deepEqual(await (await request('sudoku-coach/HqJ9')).json(),
    { ...expected, coach: { ...expected.coach, declaredRules: { globalEntropy: true, adjacentTotals: [7, 13] } } })
  while (examplesToCheck.length) assert.deepEqual(await (await request('sudoku-coach/HqJ9')).json(), expected)
})


test('a complete black-dot declaration never absorbs unrelated author instructions', async ({ mock }) => {
  const code = 'SCv7_32_102aa'
  const publication = { sudoku_id: 'K95q', sudoku: code, name: 'Complete black dots',
    blocked: false, custom_constraints: false }
  const descriptions = [
    'All possible black dots are given',
    'Not all black dots are given.',
    'All black dots are given except in row 1.',
    'All black dots are given.\nDots also count diagonally.',
  ]
  mock.method(globalThis, 'fetch', async () => new Response(
    '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: { ...publication, description: descriptions.shift() } }) + '</script>'))
  const expected = { code, coach: { title: publication.name, hasAuthorInstructions: true } }
  assert.deepEqual(await (await request('sudoku-coach/K95q')).json(),
    { ...expected, coach: { ...expected.coach, authoredRule: 'all-black-dots' } })
  while (descriptions.length) assert.deepEqual(await (await request('sudoku-coach/K95q')).json(), expected)
})
