import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import worker from '../cloudflare/pages/_worker.js'
import { detectPuzzle } from '../src/sudoku/puzzle-import.ts'
import { coachCode } from './helpers/coach-code.ts'

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

test('Coach collection imports resolve only listed IDs under the complete collection path', async ({ mock }) => {
  const path = 'sudoku-coach/collections/halloween-2024'
  const index = 'https://sudoku.coach/beapi/get-collection-hierarchy'
  const upstream = 'https://sudoku.coach/beapi/get-sudoku/675G'
  const code = 'SCv7_32_102aa'
  let publication: object = {
    sudoku_id: '675G', sudoku: code, name: 'Pumpkin 2024', published: false,
    blocked: false, custom_constraints: false, description: '',
  }
  const completePublication = publication
  let hierarchy: object = { id: 'collections', groups: [{ items: [
    { id: 'halloween-2024', groups: [{ items: ['675G'] }] },
    { id: 'daily', groups: [{ items: [{ id: '01', groups: [{ items: ['675G'] }] }] }] },
  ] }] }
  const fetcher = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url === index || url === upstream)
    return Response.json(url === index ? { hierarchy } : publication)
  })
  for (const unsafe of ['halloween-2024/675G/extra', 'halloween-2024/675G%2F675G', '%2Fhalloween-2024/675G']) {
    assert.equal((await request('sudoku-coach/collections/' + unsafe)).status, 404)
  }
  assert.equal((await request(path + '/675G', { method: 'POST' })).status, 405)
  assert.equal(fetcher.mock.callCount(), 0)
  for (const wrong of [path + '/Unlisted', 'sudoku-coach/collections/other/675G', 'sudoku-coach/collections/daily/675G']) {
    assert.equal((await request(wrong)).status, 404)
  }
  assert.deepEqual(fetcher.mock.calls.map(call => call.arguments[0]), [index, index, index])
  const accepted = { code, coach: { title: 'Pumpkin 2024', hasAuthorInstructions: false } }
  assert.deepEqual(await (await request(path + '/675G')).json(), accepted)
  assert.deepEqual(await (await request('sudoku-coach/collections/daily/01/675G')).json(), accepted)
  publication = { ...completePublication, blocked: true }
  assert.equal((await request(path + '/675G')).status, 404)
  publication = { ...completePublication, sudoku_id: 'Other' }
  assert.equal((await request(path + '/675G')).status, 502)
  publication = { ...completePublication, sudoku: code + '!' }
  assert.equal((await request(path + '/675G')).status, 422)
  publication = { ...completePublication, sudoku: '0'.repeat(81) }
  assert.equal((await request(path + '/675G')).status, 200)
  hierarchy = {}
  assert.equal((await request(path + '/675G')).status, 502)
})

test('plain published Coach grids are read only from the matching publication and still check instructions', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/coach-plain-grid.json', import.meta.url), 'utf8'))
  const url = 'https://sudoku.coach/en/s/' + source.sudoku_id
  const page = (specificSudoku: object) => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'
  let html = page(source)
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === url
    ? Promise.resolve(new Response(html))
    : worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {}))
  assert.deepEqual(await detectPuzzle(url), { givens: source.sudoku, format: 'Sudoku Coach', title: source.name })
  for (const change of [
    { sudoku_id: 'Different' }, { blocked: true }, { description: null }, { sudoku: undefined },
    { sudoku: [source.sudoku] }, { sudoku: source.sudoku.slice(1) },
  ]) {
    html = page({ ...source, ...change }) + `<div>${source.sudoku}</div>`
    await assert.rejects(detectPuzzle(url), /supported puzzle export/)
  }
  for (const change of [{ description: 'Both main diagonals are extra houses.' }, { custom_constraints: true }]) {
    html = page({ ...source, ...change })
    await assert.rejects(detectPuzzle(url), /author instructions/)
  }
})

test('collection exports cannot drop author instructions from sized grids', async ({ mock }) => {
  const base = 'https://sudoku.coach'
  const id = 'Mini'
  const code = coachCode({ gridSize: 4, givenDigits: '0234341221434321' })
  const puzzle = { sudoku_id: id, sudoku: code, name: 'Four-cell boxes', blocked: false, custom_constraints: false, description: '' }
  let description = ''
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === base + '/beapi/get-collection-hierarchy') return Promise.resolve(Response.json({
      hierarchy: { id: 'collections', groups: [{ items: [{ id: 'mini', groups: [{ items: [id] }] }] }] },
    }))
    if (path === base + '/beapi/get-sudoku/' + id) return Promise.resolve(Response.json({ ...puzzle, description }))
    return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
  })
  const url = base + '/en/collections/mini/s/' + id
  const imported = await detectPuzzle(url)
  assert.equal(imported.grid?.size, 4)
  assert.equal(imported.title, puzzle.name)
  description = 'Digits in shaded positions count twice.'
  await assert.rejects(detectPuzzle(url), /author instructions/)
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

test('Coach author notes never bypass custom constraints or extra instructions', async ({ mock }) => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8'))
  const source = examples.find(({ url }: { url: string }) => url.endsWith('/HCHW'))
  const publication = { sudoku_id: 'HCHW', sudoku: source.code, name: source.title,
    description: source.description, blocked: false, custom_constraints: false }
  let specificSudoku = publication
  mock.method(globalThis, 'fetch', (url: string, options?: RequestInit) => url.startsWith('https://sudoku.coach/en/s/')
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {}))

  const expectAuthorInstructions = async (hasAuthorInstructions: boolean) => {
    const { sudoku_id, sudoku, name } = specificSudoku
    assert.deepEqual(await (await request(`sudoku-coach/${sudoku_id}`)).json(),
      { code: sudoku, coach: { title: name, hasAuthorInstructions } })
  }
  await expectAuthorInstructions(false)
  specificSudoku = { ...publication, sudoku_id: 'Ab12', description: 'Let’s go!\r\n Have fun.' }
  await expectAuthorInstructions(false)
  for (const override of [
    { custom_constraints: true },
    { custom_constraints: true, description: 'Have fun!' },
    { description: publication.description + '\nDigits count twice in purple cells.' },
    { description: 'Have fun! Digits count twice in purple cells.' },
    { description: 'Good luck!\nDigits count twice in purple cells.' },
    { sudoku_id: 'Ab12' },
  ]) {
    specificSudoku = { ...publication, ...override }
    await expectAuthorInstructions(true)
  }

  // A safe greeting still leaves the puzzle's encoded rule checks in charge.
  specificSudoku = { ...publication, description: 'Enjoy!', sudoku: coachCode({ givenConstraints: [{ type: 'fog', segments: [] }] }) }
  await assert.rejects(detectPuzzle(source.url), /Fog of War layer has invalid or unsupported reveal settings/)
})

test('published Quadruples with Min/Max or numbered dots preserve the full definition by short link', async ({ mock }) => {
  const sources = JSON.parse(readFileSync(new URL('./fixtures/quadruple-coach-mixed-rules.json', import.meta.url), 'utf8')) as {
    url: string; title: string; coach: string; description?: string
  }[]
  let changedNote = false
  mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    if (!url.startsWith('https://sudoku.coach/en/s/')) return worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {})
    const source = sources.find(source => source.url === url)
    assert.ok(source)
    const specificSudoku = { sudoku_id: url.split('/').at(-1), sudoku: source.coach, name: source.title,
      description: changedNote ? source.description + '\nDigits count twice in purple cells.' : source.description ?? '',
      blocked: false, custom_constraints: false }
    return new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
  })
  for (const source of sources) {
    const raw = await detectPuzzle(source.coach)
    const linked = await detectPuzzle(source.url)
    assert.ok(raw.variant)
    assert.equal(linked.title, source.title)
    assert.deepEqual(linked.variant, raw.variant)
  }
  changedNote = true
  await assert.rejects(detectPuzzle(sources.find(source => source.description)!.url), /author/i)
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

test('the mirrored Renban publication accepts only encoded halves and matching pair colours', async ({ mock }) => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8'))
  const source = examples.find(({ url }: { url: string }) => url.endsWith('/Ksy3'))
  const palindrome = { type: 'palindromeLine', segments: [{ cells: [0, 10, 20, 30, 40] }] }
  const renban = { type: 'renban', segments: [{ cells: [40, 30, 20] }] }
  const palette = ['red', 'green', 'blue']
  const cellColours = new Map([[0, '01'], [10, '02'], [30, '20'], [40, '10']])
  const coloursAtCells = () => Array.from({ length: 81 }, (_, i) => cellColours.get(i) ?? '').join(',')
  const data = { colours: palette, givenColours: coloursAtCells(), givenConstraints: [palindrome, renban] }
  const publication = { sudoku_id: 'Ksy3', sudoku: coachCode(data), name: source.title,
    description: source.description.replaceAll('\n', '\r\n'), custom_constraints: false, blocked: false }
  let specificSudoku = publication
  mock.method(globalThis, 'fetch', (url: string, options?: RequestInit) => url === source.url
    ? Promise.resolve(new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>'))
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {}))

  const imported = await detectPuzzle(source.url)
  assert.deepEqual((await detectPuzzle(publication.sudoku)).variant, imported.variant)
  assert.deepEqual(imported.variant?.puzzle.rules, [
    { type: 'palindrome', cells: [0, 10, 20, 30, 40] },
    { type: 'renban', cells: [40, 30, 20] },
  ])

  for (const givenConstraints of [[palindrome], [palindrome, { ...renban, segments: [{ cells: [40, 30] }] }], [renban]]) {
    specificSudoku = { ...publication, sudoku: coachCode({ ...data, givenConstraints }) }
    await assert.rejects(detectPuzzle(source.url), /does not match its published mirrored Renban/)
    await assert.rejects(detectPuzzle(specificSudoku.sudoku), /unsupported authored markings/)
  }

  cellColours.set(20, cellColours.get(40)!)
  cellColours.delete(40)
  specificSudoku = { ...publication, sudoku: coachCode({ ...data, givenColours: coloursAtCells() }) }
  await assert.rejects(detectPuzzle(source.url), /does not match its published mirrored Renban/)
  await assert.rejects(detectPuzzle(specificSudoku.sudoku), /unsupported authored markings/)

  for (const override of [
    { description: publication.description + '\nRed cells also count twice.' },
    { custom_constraints: true },
  ]) {
    specificSudoku = { ...publication, ...override }
    await assert.rejects(detectPuzzle(source.url), /has author instructions/)
  }
})
