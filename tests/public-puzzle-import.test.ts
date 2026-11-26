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

test('published SudokuPad paths keep the author namespace and decode a percent-encoded export once', async ({ mock }) => {
  const fetcher = mock.method(globalThis, 'fetch', async () => new Response('fpuzN4A%2FB%2BC%3D'))
  const result = await request('sudokupad/author-name/first-puzzle')
  assert.deepEqual(await result.json(), { code: 'fpuzN4A/B+C=' })
  assert.equal(fetcher.mock.calls[0].arguments[0], 'https://sudokupad.app/api/puzzle/author-name/first-puzzle')
  for (const path of ['a/b/c', 'a//b', 'a%2Fb', 'a/%2Fb']) {
    assert.equal((await request('sudokupad/' + path)).status, 404)
  }
  assert.equal(fetcher.mock.callCount(), 1)
  fetcher.mock.mockImplementation(async () => new Response('fpuzN4A%ZZ'))
  assert.equal((await request('sudokupad/author-name/first-puzzle')).status, 422)
})

test('SudokuPad endless IDs resolve through its CORS-enabled legacy export endpoint', async ({ mock }) => {
  const fetcher = mock.method(globalThis, 'fetch', async () => new Response('sclN4Export+'))
  const response = await request('sudokupad/endless/p8eox828os')
  assert.deepEqual(await response.json(), { code: 'sclN4Export+' })
  assert.equal(fetcher.mock.calls[0].arguments[0], 'https://sudokupad.svencodes.com/ctclegacy/p8eox828os')
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

test('#381 imports the published 6×6 Coach Nonogram and keeps its full rule set', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sized-coach-nonogram.json', import.meta.url), 'utf8')) as {
    sudoku_id: string; sudoku: string; name: string; description: string; solution: string; givenDigits?: string
  }
  const url = `https://sudoku.coach/en/s/${source.sudoku_id}`
  let description = source.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: source.sudoku_id, sudoku: source.sudoku, name: source.name, blocked: false,
    custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === url) return Promise.resolve(new Response(page()))
    if (typeof path === 'string' && path.startsWith('/api/v1/import/')) {
      return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
    }
    return Promise.resolve(new Response('Not found.', { status: 404 }))
  })

  const metadata = await (await request('sudoku-coach/8kgS')).json()
  assert.deepEqual(metadata, { code: source.sudoku, coach: {
    hasAuthorInstructions: true, authoredRule: 'sized-nonogram', title: source.name,
  } })
  const imported = await detectPuzzle(url)
  assert.equal(imported.title, source.name)
  assert.deepEqual(imported.grid, { size: 6, noRegions: true })
  assert.equal(imported.givens?.length, 36)
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'nonogram').length, 12)
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'renban').length, 7)
  assert.ok(imported.sizedRules?.some(rule => rule.type === 'xv'))
  assert.ok(!imported.sizedRules?.some(rule => rule.type === 'little-killer'))
  assert.ok(imported.grid && imported.sizedRules)
  await assert.rejects(detectPuzzle(source.sudoku), /6 × 6 Jigsaw grid/)
  description += '\nThe rows also obey another rule.'
  await assert.rejects(detectPuzzle(url), /author instructions/)
})

test('GEnq imports its encoded 6×6 rules when the exact note only sets a solve-time challenge', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-6x6-thermo.json', import.meta.url), 'utf8')) as {
    sudoku_id: string; sudoku: string; name: string; description: string; reportedSolution: string
  }
  const url = `https://sudoku.coach/en/s/${source.sudoku_id}`
  const endpoint = `https://sudoku.coach/beapi/get-sudoku/${source.sudoku_id}`
  let description = source.description
  const publication = () => ({ sudoku_id: source.sudoku_id, sudoku: source.sudoku, name: source.name,
    blocked: false, custom_constraints: false, description })
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: publication() }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === url) return Promise.resolve(new Response(page()))
    if (path === endpoint) return Promise.resolve(Response.json(publication()))
    if (typeof path === 'string' && path.startsWith('/api/v1/import/')) {
      return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
    }
    return Promise.resolve(new Response('Not found.', { status: 404 }))
  })

  const metadata = await (await request('sudoku-coach/GEnq')).json()
  assert.deepEqual(metadata, { code: source.sudoku, coach: {
    hasAuthorInstructions: false, title: source.name,
  } })
  const imported = await detectPuzzle(url)
  assert.equal(imported.title, source.name)
  assert.deepEqual(imported.grid, { size: 6, boxRows: 2, boxColumns: 3 })
  assert.equal(imported.givens, '000000000000000006400000000000010000')
  assert.deepEqual(imported.sizedRules, [
    { type: 'diagonal', diagonal: 'main' },
    { type: 'parity', cells: [25, 10], parity: 'even' },
    { type: 'thermometer', cells: [12, 6, 0, 1] },
    { type: 'thermometer', cells: [23, 29, 35, 34] },
  ])
  assert.equal(source.reportedSolution.length, 24)

  description += '\nPalindrome lines apply.'
  const changedMetadata = await (await request('sudoku-coach/GEnq')).json()
  assert.equal(changedMetadata.coach.hasAuthorInstructions, true)
  await assert.rejects(detectPuzzle(url), /author instructions/)
})

test('#382 imports the published 7×7 Coach Skyscrapers clues from code and short link', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/skyscrapers-coach-9W3o.json', import.meta.url), 'utf8')) as {
    metadata: { sudoku_id: string; sudoku: string; name: string; description: string; solution: string }
  }
  const url = `https://sudoku.coach/en/s/${source.metadata.sudoku_id}`
  let description = source.metadata.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: source.metadata.sudoku_id, sudoku: source.metadata.sudoku, name: source.metadata.name, blocked: false,
    custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === url) return Promise.resolve(new Response(page()))
    if (typeof path === 'string' && path.startsWith('/api/v1/import/')) {
      return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
    }
    return Promise.resolve(new Response('Not found.', { status: 404 }))
  })

  const metadata = await (await request('sudoku-coach/9W3o')).json()
  assert.deepEqual(metadata, { code: source.metadata.sudoku, coach: {
    hasAuthorInstructions: true, authoredRule: 'sized-skyscrapers', title: source.metadata.name,
  } })
  const imported = await detectPuzzle(url)
  assert.equal(imported.title, source.metadata.name)
  assert.deepEqual(imported.grid, { size: 7, noRegions: true })
  assert.equal(imported.givens?.length, 49)
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'skyscrapers').length, 12)
  assert.deepEqual(imported.sizedRules?.filter(rule => rule.type === 'skyscrapers').map(rule =>
    rule.type === 'skyscrapers' ? [rule.direction, rule.index, rule.count] : []), [
    ['north', 3, 3], ['north', 5, 2], ['east', 4, 4], ['west', 2, 5], ['north', 4, 2],
    ['east', 1, 3], ['east', 2, 3], ['east', 6, 5], ['south', 5, 4], ['south', 0, 4],
    ['west', 5, 5], ['west', 0, 3],
  ])
  const copiedCode = await detectPuzzle(source.metadata.sudoku)
  assert.deepEqual(copiedCode.grid, imported.grid)
  assert.deepEqual(copiedCode.sizedRules, imported.sizedRules)
  description += '\nA decorative label was changed.'
  await assert.rejects(detectPuzzle(url), /author instructions/)
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
  await assert.rejects(detectPuzzle(url), /author instructions|could not be opened|incomplete/)
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

test('Coach wrapped-region metadata is tied to the exact Mini Jigsaw source and wording', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/coach-mini-wrapped-jigsaw.json', import.meta.url), 'utf8'))
  let description = source.description
  const url = 'https://sudoku.coach/en/s/DMnw'
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'DMnw', sudoku: source.code, name: source.title, blocked: false,
    custom_constraints: false, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', async () => new Response(page()))
  assert.deepEqual(await (await request('sudoku-coach/DMnw')).json(), {
    code: source.code,
    coach: { hasAuthorInstructions: true, authoredRule: 'wrapped-regions', title: source.title },
  })
  description += '. Other adjacent cells also wrap.'
  assert.deepEqual(await (await request('sudoku-coach/DMnw')).json(), {
    code: source.code, coach: { hasAuthorInstructions: true, title: source.title },
  })
})

test('Cmki short-link import retains its complete 6×6 rules only for the reviewed export and note', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/modular-coach.json', import.meta.url), 'utf8')).examples
    .find((example: { url: string }) => example.url.endsWith('/Cmki'))
  assert.ok(source)
  const url = source.url
  let code = source.code
  let description = source.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'Cmki', sudoku: code, name: source.title, blocked: false,
    custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === url
    ? Promise.resolve(new Response(page()))
    : typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const imported = await detectPuzzle(url)
  assert.equal(imported.format, 'Sudoku Coach')
  assert.equal(imported.title, source.title)
  assert.deepEqual(imported.givens, '0'.repeat(36))
  assert.equal(imported.grid?.size, 6)
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'whispers').length, 2)
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'xv').length, 1)
  assert.equal(imported.sizedRules?.filter(rule => rule.type === 'modular').length, 4)

  description += '\nCells in the shaded region also form a Renban line.'
  await assert.rejects(detectPuzzle(url), /author instructions/i)
  description = source.description
  code = source.code.slice(0, 10) + (source.code[10] === '0' ? '1' : '0') + source.code.slice(11)
  await assert.rejects(detectPuzzle(url), /author instructions|unsupported|invalid|could not be opened/i)
})

test('the reviewed Neighbor Match short link keeps its author rule and rejects changed context', async ({ mock }) => {
  const authored = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-authored-layers.json', import.meta.url), 'utf8')) as {
    examples: { issue: number; code: string; sourceDescription?: string }[]
  }
  const source = authored.examples.find(example => example.issue === 545)
  assert.ok(source?.code && source.sourceDescription)
  const code = source.code
  const url = 'https://sudoku.coach/en/s/CGrN'
  const description = source.sourceDescription
  let sourceCode = code
  let sourceDescription = description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'CGrN', sudoku: sourceCode, name: 'Raumploximentroplaner', blocked: false,
    custom_constraints: false, description: sourceDescription,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => {
    if (path === url) return Promise.resolve(new Response(page()))
    if (typeof path === 'string' && path.startsWith('/api/v1/import/')) {
      return worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
    }
    return new Response('Not found.', { status: 404 })
  })

  const imported = await detectPuzzle(url)
  assert.equal(imported.title, 'Raumploximentroplaner')
  assert.equal(imported.variant?.puzzle.rules?.filter(rule => rule.type === 'neighbor-match').length, 1)
  sourceDescription += '\nThe digits in blue cells must also be even.'
  await assert.rejects(detectPuzzle(url), /author instructions/)
  sourceDescription = description
  sourceCode = code.slice(0, 8) + (code[8] === '0' ? '1' : '0') + code.slice(9)
  await assert.rejects(detectPuzzle(url), /author instructions|could not be opened|incomplete/)
})

test('Entropic Spiral and Entropic Order short links retain their authored mathematical rules', async ({ mock }) => {
  const { examples: entropyExamples } = JSON.parse(readFileSync(new URL('./fixtures/entropic-coach.json', import.meta.url), 'utf8')) as {
    examples: { url: string; title: string; code: string; solution: string }[]
  }
  const { examples: globalExamples } = JSON.parse(readFileSync(new URL('./fixtures/global-entropy-coach.json', import.meta.url), 'utf8')) as {
    examples: { url: string; title: string; code: string; solution: string }[]
  }
  const sources = [
    { source: entropyExamples.find(example => example.url.endsWith('/LEjN'))!,
      description: 'Wherever the entropic spiral line is broken, it is impossible to connect. i.e. the line is only broken at points where linear entropy is broken',
      authoredRule: 'forbidden-entropic-connection', expectedRules: 16 },
    { source: globalExamples.find(example => example.url.endsWith('/7nms'))!,
      description: 'Clues outside the grid incicate, that the three digits of an entropic group (Low/Medium/High) must be placed in increasing order in the corresponding row or column seen from the clue.',
      authoredRule: 'digit-order', expectedRules: 7 },
  ]
  let active: typeof sources[number]
  let activeCode = sources[0].source.code
  let description = ''
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: active.source.url.split('/').at(-1), sudoku: activeCode, name: active.source.title,
    blocked: false, custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === active.source.url
    ? Promise.resolve(new Response(page()))
    : typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  for (const item of sources) {
    assert.ok(item.source)
    active = item
    activeCode = item.source.code
    description = item.description

    const linked = await detectPuzzle(item.source.url)
    const raw = await detectPuzzle(item.source.code)
    assert.equal(linked.title, item.source.title)
    assert.deepEqual(linked.variant?.puzzle, raw.variant?.puzzle)
    assert.equal(linked.variant?.puzzle.rules?.filter(rule => rule.type === item.authoredRule).length, item.expectedRules)

    description += '\nDigits in purple cells count twice.'
    await assert.rejects(detectPuzzle(item.source.url), /author instructions/i)
    description = item.description
    activeCode = item.source.code.slice(0, 10) + (item.source.code[10] === '0' ? '1' : '0') + item.source.code.slice(11)
    await assert.rejects(detectPuzzle(item.source.url), /author instructions|does not match|could not be opened/i)
  }
})

test('the reviewed #542–547 Coach links preserve authored rules and art without accepting changed context', async ({ mock }) => {
  const { examples } = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-authored-layers.json', import.meta.url), 'utf8')) as {
    examples: { issue: number; id: string; title: string; code: string }[]
  }
  const descriptions = new Map<number, string>([
    [542, 'A small entropy snack for Raumplaner, to thank you for all your wonderful contributions to the community 🤗 Like a regular Entropy puzzle, every 2x2 box contains at least a low, middle and high digit. The shapes tell you which digit group appears twice in that 2x2 box. Low digits: green squares Middle digits: purple hexagon High digits: pink circles'],
    [543, 'A special puzzle to thank Raumplaner for all of his amazing puzzles <3 SE 2.3 Aqre: - colour some cells blue so that all blue cells form one connected group - Regions with cosmetic numbers must contain the indicated count of blue cells, and it is allowed to colour the numbered cells --> These regions are NOT sudoku regions, it\'s a latin square puzzle! - The digits in cells with a circle also indicate the amount of blue cells in that region - There may not exist a run of four or more consecutive blue or orange cells horizontally or vertically anywhere in the grid'],
    [544, 'My first time trying to set a sudoku with these constraints, inspired by Raumplaner!'],
    [546, 'A Special Puzzle made as "Thank you" sign for the @Raumplaner\'s efforts in the community. (Aqre+) Rules= - Shade some cells so that all shaded cells form one orthoronally connected area. - Regions with numbers (given) must contain the indicated amount of shaded cells. - No Row or Column run of four or more consecutive cells may be entirely shaded, nor entirely unshaded. - If a Given digit (indicator) is in a shaded cell, then the shaded digits in its region must be a consecutive sequence of digits, in any order. Just to clarify/remind: there is no normal Regions, so digits are allowed to repeat inside marked regions, within the limits of other rules. Credits: Thanks @Aeb for giving an valuable Feedback to the puzzle.'],
    [547, 'This puzzle is a thank you to Raumplaner, who always makes nice puzzles for us. Since I love his Palindrome coloring puzzles, this is my try at creating one for him. Thank you Raumplaner and I hope you (and of course everyone else as well) enjoys it 🍀 Big thanks also to h4nv and GenevieveArchbaker for testing and to Charly for organizing this :)'],
  ])
  const items = [542, 543, 544, 546, 547].map(issue => {
    const source = examples.find(example => example.issue === issue)!
    return { issue, source, description: descriptions.get(issue)! }
  })
  let active = items[0]
  let activeCode = active.source.code
  let description = active.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: active.source.id, sudoku: activeCode, name: active.source.title,
    blocked: false, custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (path: string, options?: RequestInit) => path === `https://sudoku.coach/en/s/${active.source.id}`
    ? Promise.resolve(new Response(page()))
    : typeof path === 'string' && path.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(path, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  for (const item of items) {
    active = item
    activeCode = item.source.code
    description = item.description
    const linked = await detectPuzzle(`https://sudoku.coach/en/s/${item.source.id}`)
    const raw = await detectPuzzle(item.source.code)
    assert.equal(linked.title, item.source.title)
    assert.deepEqual(linked.variant?.puzzle, raw.variant?.puzzle, `issue #${item.issue}`)
    assert.deepEqual(linked.authoredArtwork, raw.authoredArtwork, `issue #${item.issue} artwork`)

    description += '\nAn extra rule applies to purple cells.'
    await assert.rejects(detectPuzzle(`https://sudoku.coach/en/s/${item.source.id}`), /author instructions/i)
    description = item.description
    activeCode = item.source.code.slice(0, 10) + (item.source.code[10] === '0' ? '1' : '0') + item.source.code.slice(11)
    await assert.rejects(detectPuzzle(`https://sudoku.coach/en/s/${item.source.id}`), /author instructions|does not match|could not be opened/i)
  }
})

test('the reviewed Magic Square short link preserves the authored rule and rejects altered source data', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-magic-square.json', import.meta.url), 'utf8')) as {
    code: string; title: string; description: string; url: string
  }
  let sudoku = source.code
  let description = source.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: '7uYV', sudoku, name: source.title, blocked: false,
    custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (url: string, options?: RequestInit) => url === source.url
    ? Promise.resolve(new Response(page()))
    : typeof url === 'string' && url.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const linked = await detectPuzzle(source.url)
  const raw = await detectPuzzle(source.code)
  assert.deepEqual(linked.variant, raw.variant)
  assert.deepEqual(linked.variant?.puzzle.rules?.find(rule => rule.type === 'magic-square'), {
    type: 'magic-square', cells: [30, 31, 32, 39, 40, 41, 48, 49, 50],
  })
  description += '\nDigits in red cells count twice.'
  await assert.rejects(detectPuzzle(source.url), /author instructions/i)
  description = source.description
  sudoku = source.code.slice(0, 10) + (source.code[10] === '0' ? '1' : '0') + source.code.slice(11)
  await assert.rejects(detectPuzzle(source.url), /author instructions|could not be opened|incomplete/i)
})

test('Unique Cages III short-link imports keep its authored totals and C links', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-unknown-cage-totals.json', import.meta.url), 'utf8')) as {
    code: string; title: string; description: string; url: string
  }
  let description = source.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'EZjn', sudoku: source.code, name: source.title, blocked: false,
    custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (url: string, options?: RequestInit) => url === source.url
    ? Promise.resolve(new Response(page()))
    : typeof url === 'string' && url.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const linked = await detectPuzzle(source.url)
  const raw = await detectPuzzle(source.code)
  assert.deepEqual(linked.variant, raw.variant)
  assert.equal(linked.variant?.puzzle.rules?.some(rule => rule.type === 'unknown-cage-sums'), true)
  description += '\nDigits in red cells count twice.'
  await assert.rejects(detectPuzzle(source.url), /author instructions/i)
})

test('Distant Neighbors short-link imports keep the box identity declaration', async ({ mock }) => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/sudoku-coach-distant-neighbors.json', import.meta.url), 'utf8')) as {
    code: string; title: string; description: string; url: string
  }
  let description = source.description
  const page = () => '<script>let mainInitData = ' + JSON.stringify({ specificSudoku: {
    sudoku_id: 'F5mq', sudoku: source.code, name: source.title, blocked: false,
    custom_constraints: true, description,
  } }) + '</script>'
  mock.method(globalThis, 'fetch', (url: string, options?: RequestInit) => url === source.url
    ? Promise.resolve(new Response(page()))
    : typeof url === 'string' && url.startsWith('/api/v1/import/')
      ? worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {})
      : Promise.resolve(new Response('Not found.', { status: 404 })))

  const linked = await detectPuzzle(source.url)
  const raw = await detectPuzzle(source.code)
  assert.deepEqual(linked.variant, raw.variant)
  assert.equal(linked.variant?.puzzle.rules?.some(rule => rule.type === 'distant-neighbors'), true)
  description += '\nDigits in red cells count twice.'
  await assert.rejects(detectPuzzle(source.url), /author instructions/i)
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

test('reviewed Quadruple publications import by short link with their complete rules', async ({ mock }) => {
  const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
  const { examples } = load('global-entropy-coach')
  const cases = [
    [load('quadruple-coach-impossible'), "They'll tell you this puzzle ain't got no start. You just gotta poke around.\nIf you're like me you'll get ~5 digits then think it's over. But if you look very carefully you'll see there are two more digits to place right away."],
    [load('quadruple-coach-quadcage'), 'inspired by one of Raumplaner’s quad puzzles. :) enjoy!'],
    [examples.find(({ url }: { url: string }) => url.endsWith('/A2s7')), 'The only way I could find to solve without brute force was to use the hint I give in the comments. Let me know if you find another way!'],
    [examples.find(({ url }: { url: string }) => url.endsWith('/CJhv')), 'There is maybe one sneaky ish trick that might make this a 7/10. Let me know if you need a hint :)'],
  ] as const
  let specificSudoku: object
  mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => url.startsWith('https://sudoku.coach/en/s/')
    ? new Response('<script>let mainInitData = ' + JSON.stringify({ specificSudoku }) + '</script>')
    : worker.fetch(new Request(new URL(url, 'https://sudoku.example'), options), {}, {}))

  for (const [source, description] of cases) {
    const sudoku = source.code ?? source.coach
    const data = { sudoku_id: source.url.split('/').at(-1), sudoku, name: source.title,
      description, blocked: false, custom_constraints: false }
    specificSudoku = data
    const linked = await detectPuzzle(source.url)
    assert.equal(linked.title, source.title)
    assert.ok(linked.variant)
    assert.deepEqual(linked.variant, (await detectPuzzle(sudoku)).variant)
    specificSudoku = { ...data, description: description + '\nDigits in colored cells count twice.' }
    await assert.rejects(detectPuzzle(source.url), /author instructions/i)
  }
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
  const { metadata } = JSON.parse(readFileSync(new URL('./fixtures/x-sum-AsnF.json', import.meta.url), 'utf8'))
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
