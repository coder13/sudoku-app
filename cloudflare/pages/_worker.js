const base = '/api/v1/'
const secretPattern = /^[a-f0-9]{64}$/
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/
const shareIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const maxBytes = 1536 * 1024
const maxDefinitionBytes = 256 * 1024
function deviceName(id, name = '') {
  if (typeof name !== 'string') throw new HttpError(400, 'Invalid device name.')
  return name.trim().slice(0, 60) || 'Device ' + id.slice(0, 6).toUpperCase()
}
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
const secret = () => hex(crypto.getRandomValues(new Uint8Array(32)))
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function input(request, limit = 2048, tooLarge = 'Save is too large.') {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.')
  if (+request.headers.get('Content-Length') > limit) throw new HttpError(413, tooLarge)
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'Missing request body.')
  const decoder = new TextDecoder()
  let size = 0, content = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { await reader.cancel(); throw new HttpError(413, tooLarge) }
    content += decoder.decode(value, { stream: true })
  }
  try {
    const result = JSON.parse(content + decoder.decode())
    if (result && typeof result === 'object' && !Array.isArray(result)) return result
  } catch { /* Report malformed input consistently. */ }
  throw new HttpError(400, 'Invalid request.')
}

const maximumPuzzleCodeLength = 20_000
const coachId = /^[A-Za-z0-9]{1,16}$/
const coachCollectionSegment = /^[a-z0-9-]{1,64}$/
const isCoachClassicGrid = code => typeof code === 'string' && /^[0-9]{81}$/.test(code)
const coachCodeSource = 'SCv(?:7_32_[0-9a-v]+\\b|[3-6]_[0-9a-z_()[\\]+.-]+)'
const embeddedCoachCode = new RegExp('\\b' + coachCodeSource, 'gi')
const exactCoachCode = new RegExp('^' + coachCodeSource + '$', 'i')
const publicPuzzleSources = {
  'sudoku-coach': {
    pattern: coachId,
    url: id => `https://sudoku.coach/en/s/${id}`,
    maxBytes: 512 * 1024,
    code(text) {
      const codes = new Set(text.match(embeddedCoachCode) ?? [])
      return codes.size === 1 ? codes.values().next().value : undefined
    },
  },
  sudokupad: {
    pattern: /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64})?$/,
    url: id => id.startsWith('endless/')
      ? `https://sudokupad.svencodes.com/ctclegacy/${id.slice('endless/'.length)}`
      : `https://sudokupad.app/api/puzzle/${id}`,
    maxBytes: 20_024,
    code(text) {
      let value
      try { value = decodeURIComponent(text.trim()) } catch { return }
      return /^(?:scl|ctc|fpuzzles|fpuz|scf)[A-Za-z0-9+/=_-]+$/i.test(value) ? value : undefined
    },
  },
}

const coachRatingNote = /^SE \d{1,3}(?:\.\d{1,3})?$/i

// Recognize a complete authored declaration, including the optional credit and rating.
function declaresCoachXSums(lines) {
  lines = [...lines]
  if (/^Special request by [\w-]{1,32} :D$/i.test(lines[0])) lines.shift()
  if (/^(?:Normal|Standard) Sudoku rules apply\.$/i.test(lines[0])) lines.shift()
  if (coachRatingNote.test(lines.at(-1))) lines.pop()
  return lines.length === 3 &&
    /^Variant Rules \(X[ -]Sums\):$/i.test(lines[0]) &&
    /^- Clues outside the grid indicate the sum of the first X digits in the corresponding direction\.$/i.test(lines[1]) &&
    /^- X is the first digit in the corresponding direction\.$/i.test(lines[2])
}

function coachAuthoredRule(lines) {
  if (lines.length === 1 && /^All (?:possible )?black dots are given[.!]?$/i.test(lines[0])) return 'all-black-dots'
  if (lines.length === 1 &&
    /^Quad[ -]?arrows: One of the four digits around a circle must be the sum of the other three digits around that circle\.?$/i.test(lines[0])) return 'quad-arrows'
  if (declaresCoachXSums(lines)) return 'x-sum'
}

// A published legend can refer to fully encoded rules. The app checks those
// rules against the export before it accepts the publication.
function coachTypedDeclaration(lines) {
  const cages = lines.length === 1 && /^All cages are (\d{1,2}) or (\d{1,2})[.!]?$/i.exec(lines[0])
  if (cages) {
    const totals = cages.slice(1).map(Number)
    if (totals.every(sum => sum >= 1 && sum <= 45) && totals[0] !== totals[1]) return { cageTotals: totals }
  }
  const requirements = [
    /^VII\s*=\s*7[.!]?$/i, /^XIII\s*=\s*13[.!]?$/i, /^Note global entropy[.!]?$/i,
  ]
  const commentary = /^(?:This is my first (?:little )?experiment with these constraints(?: so it is (?:fairly )?straightforward)?, I hope you like it|Colou?ring is your friend)[.!]$/i
  const declared = lines.filter(line => !commentary.test(line))
  if (declared.length === requirements.length && requirements.every(pattern => declared.some(line => pattern.test(line)))) {
    return { globalEntropy: true, adjacentTotals: [7, 13] }
  }
}

const coachGreeting = /^(?:good luck|have fun|enjoy(?: the puzzle)?|let['’]s go)[.!]?$/i

// These descriptions cover construction, the author's solve, or where to ask
// for hints. Bind the full note to its publication so added rules stay visible.
const reviewedCoachNotes = new Map([
  // This source's only author note is a solve-time challenge; its complete
  // mathematical constraints are encoded in the export.
  ['GEnq', '8347d04585f2c27fbd5b8c407a744d295a63e1e688b090de436d49b7d9aa6298'],
  ['FLAb', '90ec75ed5b14d05432d12fb74bd3e07c33031d2c0a21423546e797cb6fe26936'],
  // FWUv's Bento description explains region outlines; the rules are encoded.
  ['FWUv', '37628a3e7b9d6537e0647a8eef0a6352ea693e6bde79a9400d44315e37882ed8'],
  ['7kvK', '3fc5d6fdf1da8e5517863b670de7ef743337ee7a9e5d6294f00edcca0c464244'],
  ['DhdV', '7b2a040b11cd623b995c7e2b78d54a0b9aaa0e48ef55b8edaf467d31d2665c2c'],
  ['HQXe', '8bbd958b3f4a8d5ca91c840be985c2fe74b02540be3cf76cdf8c978fa436f718'],
  ['HBLt', '371fca2c0cf0997409743bb24497229297638d2632e921ba99f062e915f2c07f'],
  ['7VAC', '356ebef8107975d494da2efccf6e89eb133d4d90a03d9b7f6a6cbe8236c7c644'],
  ['9Rji', '0bb9dda666e5938694d17d6c76d10ce39e3823700e1ed161bcbe349afb17c5df'],
  ['A2s7', '2f1a693b6d99e6598fce81ee680c8930a6027beff58e3bcba49a588f7862abdd'],
  ['CJhv', '83d660ac6ed3263c26843aaad8fe7cba146fdd832a46a58a60d55b10e79ae7d4'],
  ['AjZy', '9c921e472d17b801c9c6523a4fb1226fc636ed263b83a861e4f14929fcf1c445'],
  ['CdP3', '3a867f407b30e98ac7b76e4c33bfa7d372cb785ee4d0cf815468b5c63932f436'],
  ['ETLV', '8e0e085963d15a3ee3609fe7694e7c6ba3f643e6c066bde33cd5ec4369ae1aef'],
  ['DD1N', 'b1fd849b96f752b4ab3fc985405a0428859a2e1f34beafab47edf44229498e59'],
  ['EoGB', '3878f1cf8dcc3a108d0f9f4232b70b519c93e726c15249dbe8f1fb8a2055a2cc'],
  ['HCHW', '466fb79c06a194a1fe0134d57c30d96bd01c302aa6b88f64b539ce245a658136'],
  // This exact legend labels the two encoded line styles; it adds no rule.
  ['7hzU', '8c6d7c65ce35ea28fec297a68be7363fc37c08b5749febfd17a6d406c9333aaf'],
])

// Coach publishes the puzzle code and its author instructions separately.
function readCoachPage(html) {
  const scripts = [...html.matchAll(/<script>\s*let mainInitData\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/gi)]
  if (scripts.length !== 1) return
  try {
    return JSON.parse(scripts[0][1])?.specificSudoku
  } catch {
    return
  }
}

async function coachPublication(puzzle, id, code) {
  if (puzzle?.sudoku_id !== id || puzzle.sudoku !== code || puzzle.blocked !== false ||
      typeof puzzle.custom_constraints !== 'boolean' || typeof puzzle.description !== 'string') return
  const title = typeof puzzle.name === 'string' ? puzzle.name.trim().slice(0, 72) : ''
  const lines = puzzle.description.split(/\r?\n/).map(line => line.trim().replace(/[ \t]+/g, ' ')).filter(Boolean)
  const declaredRules = puzzle.custom_constraints ? undefined : coachTypedDeclaration(lines)
  // 220V uses offsets to separate drawn lines. The reconstruction applies to this verified export.
  const colouredLines = !puzzle.custom_constraints && id === '7rs9' && lines.length === 1 &&
    /^Orange = entropy, brown = modular, blue = regional sum \(including the cosmetic lines\)\.?$/i.test(lines[0]) &&
    await digest(code) === 'a454bc2435d4d69950db865205e3cd117bd3ab325bd6c528a8d6944007f357d4'
  // This publication explains its encoded Renban halves and uses colours to select mirrored pairs.
  const mirroredRenbans = !puzzle.custom_constraints && id === 'Ksy3' &&
    await digest(lines.join('\n')) === 'c5728dc0b34fdb26456e7f7e0ed449cce6c6a0ccfb468fb83880660514f75801'
  const partialRegions = puzzle.custom_constraints && id === 'JDv2' &&
    await digest(code) === '349d55e182fa4f177aff2a5653d875fea8fe775f51f0dabe06a0f9c5c308fa7a' &&
    await digest(lines.join('\n')) === 'f9ab780aef148150727d073d5cfeb733e2211ad162a2a50e9cb9ac1115af2fc6'
  const insideGrid = puzzle.custom_constraints && id === '7FCB' &&
    await digest(code) === 'a297ab70f94568f356c282821f9566ad8ac1e2ba287781737615518c306bab3c' &&
    await digest(lines.join('\n')) === '084367b723e227b486649f3641a2d4791ae491ca32bd541059cd76faa38b2a85'
  const letteredQuadruples = puzzle.custom_constraints && id === 'ALYC' &&
    await digest(code) === 'a5222a3faefbf42cdaab3c8b81958d14e5a709e89d28e45d8611fbf64a325653' &&
    await digest(lines.join('\n')) === 'c294c3a30269133929f4ac39c1144372cad5e8daf2dcfb4ad6bf08db5d9d1bdb'
  const neighborMatch = !puzzle.custom_constraints && id === 'CGrN' &&
    await digest(code) === '03e7bc424d19df4aef06c805c6b97c6a75b7f3cd9e46f22470cd5a9acd198d31' &&
    lines.length === 1 &&
    /^Each given clue number indicates that the digit must match at least one of its orthogonal neighbors\. Thanks to Raumplaner for introducing my to this constraint!$/i.test(lines[0])
  const magicSquare = puzzle.custom_constraints && id === '7uYV' &&
    await digest(code) === '8c4aceec22d1628faeb544944dfa6664913a08e1aaf468b4bcd5514fb7b844b1' &&
    lines.length === 4 && /^Rules:?$/i.test(lines[0]) &&
    /^- Digits cannot repeat in Cages\.$/i.test(lines[1]) &&
    /^- Middle Box is a Magic Square\. In a 3x3 Magic Square: every Row, Column and Diagonal has an equal sum\.$/i.test(lines[2]) &&
    /^Note: Cages with no small clue number on its corner: are all 9-cell cages\.$/i.test(lines[3])
  const unknownCageSums = puzzle.custom_constraints && id === 'EZjn' &&
    await digest(code) === 'a96fdbd3eb78af79cf63b1ce787f1d3a3e4a1d70b249f23a7dedb11e2667a88f' &&
    lines.length === 5 && /^Custom Rules:$/i.test(lines[0]) &&
    /^- Digits do not repeat in Cages\. Each Cage has an unique sum that needs to be determined\.$/i.test(lines[1]) &&
    /^- Cage-Sums must form a consecutive sequence of sums - without repeating sums - so, if a lowest Cage would be the sum of 1, then the total number of Cages is the total sum of the highest Cage-Sum\.$/i.test(lines[2]) &&
    /^- Two Cages separated by letter \[C\] means that the sum of those Cages must be consecutive\.$/i.test(lines[3]) &&
    /^Ps\. I've written out the Progressive-Hints for the full logical Solve-Path in comments\.$/i.test(lines[4])
  const distantNeighbors = puzzle.custom_constraints && id === 'F5mq' &&
    await digest(code) === 'd8fb932a0c4941b1f7732f0ea32a6d50fc4adf72c5b6c0f28621e30405be9b0f' &&
    await digest(lines.join('\n')) === 'ce4b24a59783026d64900a13f28aad86a95e100c76d9c937cc4df0bdff777cc1'
  const normalizedDescription = puzzle.description.trim().replace(/\s+/g, ' ')
  const wrappedRegions = id === 'DMnw' &&
    await digest(code) === '501832fec680e8fa268be297919615522b2a9150da212cde066797ec6e6828dc' &&
    await digest(normalizedDescription) === '47a362eba4881e510b72e237448b791366f772d4192c3b39457022d70a732919'
  const sunnyEntropy = id === 'CKio' &&
    await digest(code) === '1c8d349fc96821784cbda4323a1bc9f85d6245d7610cb2a04317c3b4815c32c6' &&
    await digest(normalizedDescription) === 'c1265a09aface15fec9b466eaba1922667b8bcd38278233785a834bcb00b8638'
  const aqreSnake = id === 'CLbA' &&
    await digest(code) === '1122b77d323927c3bebba4bf417adf32a2781b093d3c9d245de379d60c739175' &&
    await digest(normalizedDescription) === 'f37247558e631bc52f04a292345568f1999b46f099edc335c4be3cc3b2a088cf'
  const xvEntropy = id === 'CSiE' &&
    await digest(code) === 'c7c2be5873de87e5168278e3f135cb5e5c1d5c470f87757076d54b64693c9806' &&
    await digest(normalizedDescription) === '68e8bba405bb9e23afff6f1740a8820fdbcdf504c51bea91f718f656a4403971'
  const aqrePlus = id === 'CFvb' &&
    await digest(code) === 'c3f966b0f62af5c3a15e4f69169b3fbb3ca038e0869e879f181183af48fda081' &&
    await digest(normalizedDescription) === 'c52002863606aded630fdce5caab04cdbed9726d983b065cb2a76488c3187680'
  const reviewedArtwork = id === 'CS1G' &&
    await digest(code) === '512f5f0ace1feb1cae309b457724cfe8a9e36a91207358d9f9bdf4d0067a1e16' &&
    await digest(normalizedDescription) === '99d6d5d48a989f91c50d61d0f4850b73b02d2d65df11607b776dfb6c669d90e4'
  const entropicBreaks = id === 'LEjN' &&
    await digest(code) === 'd132b7f78337e31d2c433c56d70264ac46a31d7d507952c5581f661b7dcf79f9' &&
    await digest(lines.join('\n')) === '5eb666adc2b990f9f3746b25a0219e2c0a3f4ce0da75d2ba0fbe10d41316fa20'
  const entropicGroupOrder = id === '7nms' &&
    await digest(code) === 'a53d999916a980c445143564ea4188bdbf35f7df545bf2d946b4e307dedd15ba' &&
    await digest(lines.join('\n')) === '629da23297e891d66951a794a5a87c94ce5b332b58a6b756fd8ed5d13673b3ec'
  const sizedNonogram = id === '8kgS' &&
    await digest(code) === 'f9f86aa7cfcc1e3fab882cb9c5a033128e28e6a172a1828163c1be028176b932' &&
    await digest(lines.join('\n')) === '41c5bceab29cd478eaf4584e428d55226383f2c8edc6ca29bb61ca233b7f26da'
  const sizedSkyscrapers = id === '9W3o' &&
    await digest(code) === 'd9726081ddf9b97737fdb72ffd1391fab8fc204edd73f7e99613f57e06f03121' &&
    await digest(normalizedDescription) === 'b6d146d70cef35da5ee9ee38794bf8eb10e466cb4562fe5ffaa27b068eca1ffd'
  const sizedEntropicRunaround = id === 'Cmki' &&
    await digest(code) === 'eaa3711145076e992c920d15677b5f02651e829cbec2b1ba95a0d37c7f93162f' &&
    await digest(normalizedDescription) === '5a81c40e9790e9877d160f43b0bf70947717ea2cea43b9cd36a804abf53ec3a1'
  const authoredRule = coachAuthoredRule(lines) ?? (distantNeighbors ? 'distant-neighbors' : unknownCageSums ? 'unknown-cage-sums' : magicSquare ? 'magic-square' : letteredQuadruples ? 'lettered-quadruples' : insideGrid ? 'inside-grid' : partialRegions ? 'partial-regions' : colouredLines ? 'line-colours'
    : mirroredRenbans ? 'mirrored-renban' : neighborMatch ? 'neighbor-match'
      : sunnyEntropy ? 'entropy-window-groups' : aqreSnake ? 'aqre-snake' : xvEntropy ? 'xv-empty-cosmetic-cage'
        : aqrePlus ? 'aqre-plus' : reviewedArtwork ? 'reviewed-artwork'
      : entropicBreaks ? 'entropic-breaks' : entropicGroupOrder ? 'entropic-group-order'
        : wrappedRegions ? 'wrapped-regions' : sizedNonogram ? 'sized-nonogram' : sizedSkyscrapers ? 'sized-skyscrapers'
          : sizedEntropicRunaround ? 'sized-entropic-runaround' : undefined)
  // The published Whispers lesson explains the encoded rules and its digit guide.
  const whispersGuide = !puzzle.custom_constraints && id === 'B5mt' &&
    await digest(lines.join('\n')) === '1096372a68245ca1a72bcc77b65c1fba8d89ca5559c3d4666e8463d2ed5b219d'
  const reviewedNote = reviewedCoachNotes.get(id)
  const reviewedNoteDigest = await digest(lines.join('\n'))
  const alternateFwuVNote = id === 'FWUv' &&
    reviewedNoteDigest === '64d94be814557c8b9e2445e0e6e9118ce7888ae6f0f41a0a2a2ca7d7f4294748'
  const hasAuthorInstructions = puzzle.custom_constraints || !lines.every(line => coachGreeting.test(line) || coachRatingNote.test(line)) &&
    (!reviewedNote || reviewedNoteDigest !== reviewedNote) && !alternateFwuVNote
  return {
    hasAuthorInstructions,
    ...(authoredRule && { authoredRule }),
    ...(declaredRules && { declaredRules }),
    ...(whispersGuide && { whispersGuide: true }),
    ...(title && { title }),
  }
}

async function readPuzzleSource(url, maxBytes, signal) {
  let response
  try {
    response = await fetch(url, { redirect: 'manual', signal })
  } catch {
    throw new HttpError(502, 'Could not open the published puzzle.')
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    throw new HttpError(502, 'The puzzle source redirected to another location.')
  }
  if (response.status === 404) throw new HttpError(404, 'The published puzzle could not be found.')
  if (!response.ok || !response.body) throw new HttpError(502, 'The puzzle source is unavailable.')

  if (+response.headers.get('Content-Length') > maxBytes) {
    await response.body.cancel()
    throw new HttpError(413, 'The puzzle source is too large.')
  }
  const decoder = new TextDecoder()
  let content = '', bytes = 0
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength
      if (bytes > maxBytes) throw new HttpError(413, 'The puzzle source is too large.')
      content += decoder.decode(chunk, { stream: true })
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'The puzzle source is unavailable.')
  }
  return content + decoder.decode()
}

async function readCoachJSON(url, maxBytes, signal) {
  const text = await readPuzzleSource(url, maxBytes, signal)
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(502, 'Sudoku Coach returned an unreadable response.')
  }
}

function coachCollectionMembers(collection) {
  return Array.isArray(collection?.groups)
    ? collection.groups.flatMap(group => Array.isArray(group?.items) ? group.items : []) : []
}

async function loadCoachCollectionPuzzle(collectionPath, id, signal) {
  const base = 'https://sudoku.coach/beapi'
  const index = await readCoachJSON(`${base}/get-collection-hierarchy`, 512 * 1024, signal)
  if (index?.hierarchy?.id !== 'collections' || !Array.isArray(index.hierarchy.groups)) {
    throw new HttpError(502, 'Sudoku Coach returned an unreadable collection index.')
  }
  let collection = index.hierarchy
  for (const segment of collectionPath) collection = coachCollectionMembers(collection).find(item => item?.id === segment)
  if (!coachCollectionMembers(collection).includes(id)) {
    throw new HttpError(404, 'This puzzle could not be found in the Sudoku Coach collection.')
  }
  const puzzle = await readCoachJSON(`${base}/get-sudoku/${id}`, 512 * 1024, signal)
  const code = puzzle?.sudoku
  if (puzzle?.blocked === true) throw new HttpError(404, 'The published puzzle could not be found.')
  if (typeof code !== 'string' || code.length > maximumPuzzleCodeLength || !(exactCoachCode.test(code) || isCoachClassicGrid(code))) {
    throw new HttpError(422, 'This collection puzzle does not contain a supported puzzle export.')
  }
  const coach = await coachPublication(puzzle, id, code)
  if (!coach) throw new HttpError(502, 'Sudoku Coach returned incomplete puzzle details.')
  return json({ code, coach })
}

async function loadPublicPuzzle(request, path) {
  const [, provider, ...parts] = path.split('/')
  const source = Object.hasOwn(publicPuzzleSources, provider) ? publicPuzzleSources[provider] : undefined
  const id = parts.pop()
  const isCollection = provider === 'sudoku-coach' && parts[0] === 'collections' &&
    parts.length >= 2 && parts.length <= 5 && parts.slice(1).every(segment => coachCollectionSegment.test(segment))
  const sudokuPad = provider === 'sudokupad'
  const publishedId = sudokuPad ? [...parts, id].join('/') : id ?? ''
  if (!source || !source.pattern.test(publishedId) || parts.length && !isCollection && !sudokuPad) {
    throw new HttpError(404, 'Unknown puzzle link.')
  }
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.')
  const signal = AbortSignal.timeout(5_000)
  if (isCollection) return loadCoachCollectionPuzzle(parts.slice(1), id, signal)
  const content = await readPuzzleSource(source.url(publishedId), source.maxBytes, signal)
  const puzzle = provider === 'sudoku-coach' ? readCoachPage(content) : undefined
  // Only the matching publication field identifies a plain grid. Other digits
  // in the page may be a solution, description, or unrelated export.
  const plainGrid = isCoachClassicGrid(puzzle?.sudoku)
  const code = plainGrid ? puzzle.sudoku : source.code(content)
  if (!code || code.length > maximumPuzzleCodeLength) {
    throw new HttpError(422, 'This link does not contain a supported puzzle export.')
  }
  const coach = puzzle && await coachPublication(puzzle, id, code)
  if (plainGrid && !coach) throw new HttpError(422, 'This link does not contain a supported puzzle export.')
  return json({ code, ...(coach && { coach }) })
}

// The public API accepts a versioned puzzle definition. Check each nested field
// so private solve data cannot be stored inside the variant or collection object.
function fields(value, required, optional = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(required).every(([key, valid]) => Object.hasOwn(value, key) && valid(value[key])) &&
    Object.keys(value).every(key => Object.hasOwn(required, key) || Object.hasOwn(optional, key) && optional[key](value[key]))
}

const integer = (min, max) => value => Number.isInteger(value) && value >= min && value <= max
const list = (valid, min, max = Infinity) => value => Array.isArray(value) && value.length >= min && value.length <= max && value.every(valid)
const digitRank = digit => {
  const code = digit.toUpperCase().charCodeAt(0)
  return code >= 48 && code <= 57 ? code - 48 : code >= 65 && code <= 71 ? code - 55 : -1
}
const givens = (value, size = 9) => typeof value === 'string' && value.length === size ** 2 &&
  [...value].every(digit => digitRank(digit) >= 0 && digitRank(digit) <= size)
const boolean = value => typeof value === 'boolean'
const oneOf = (...choices) => value => choices.includes(value)
const miniGrid = value => fields(value, { size: oneOf(4), boxRows: oneOf(2), boxColumns: oneOf(2) })
const rectangularGrid = value => fields(value, { size: oneOf(6, 8), boxRows: oneOf(2, 3, 4), boxColumns: oneOf(2, 3, 4) }) &&
  value.boxRows * value.boxColumns === value.size
const zeroBasedGrid = value => fields(value, { size: oneOf(10), boxRows: oneOf(2, 5), boxColumns: oneOf(2, 5), notation: oneOf('zero-based') }) &&
  value.boxRows * value.boxColumns === value.size
const sharesGridEdge = (a, b, size) =>
  Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) === 1
function jigsawGrid(value) {
  const size = value?.size
  if (![3, 4, 5, 6, 7].includes(size)) return false
  if (!fields(value, { size: oneOf(size), regions: list(list(integer(0, size ** 2 - 1), size, size), size, size) },
    { wrapAround: oneOf(true) }) ||
    new Set(value.regions.flat()).size !== size ** 2) return false
  if (value.wrapAround && !value.regions.every(part => connectedRegion(part, size, true))) return false
  return true
}
function connectedRegion(part, size, wrapAround = false) {
  const connected = new Set([part[0]])
  for (const cell of connected) {
    const row = Math.floor(cell / size), column = cell % size
    const neighbors = [
      row > 0 ? cell - size : wrapAround ? cell + size * (size - 1) : -1,
      row < size - 1 ? cell + size : wrapAround ? cell - size * (size - 1) : -1,
      column > 0 ? cell - 1 : wrapAround ? cell + size - 1 : -1,
      column < size - 1 ? cell + 1 : wrapAround ? cell - size + 1 : -1,
    ]
    for (const next of part) if (sharesGridEdge(cell, next, size) || neighbors.includes(next)) connected.add(next)
  }
  return connected.size === size
}
function connectedCells(cells, size) {
  const connected = new Set([cells[0]])
  for (const cell of connected) {
    for (const next of cells) if (sharesGridEdge(cell, next, size)) connected.add(next)
  }
  return connected.size === cells.length
}
const boxlessGrid = value => fields(value, { size: oneOf(5, 6, 7, 9), noRegions: oneOf(true) })
const sizedGrid = value => miniGrid(value) || rectangularGrid(value) || zeroBasedGrid(value) || jigsawGrid(value) || boxlessGrid(value)
function numberedDotRule(rule, size) {
  const pair = value => list(integer(0, size ** 2 - 1), 2, 2)(value) && sharesGridEdge(value[0], value[1], size)
  const mark = value => fields(value, { cells: pair, value: rule.relation === 'ratio' ? integer(2, size) : integer(1, size - 1) })
  return fields(rule, { type: oneOf('labeled-dots'), relation: oneOf('difference', 'ratio'),
    marks: list(mark, 0, 2 * size * (size - 1)) }, { negative: boolean }) && (rule.marks.length > 0 || rule.negative === true)
}

function sizedRules(value, { size, boxRows, boxColumns, regions, noRegions, notation }) {
  const cell = integer(0, size * size - 1)
  const pair = value => list(cell, 2, 2)(value) && sharesGridEdge(value[0], value[1], size)
  const maxArrowCells = notation === 'zero-based' ? 2 * size - 1 : size
  const marks = value => fields(value, {}, { pairs: list(pair, 0, 2 * size * (size - 1)), negative: boolean })
  const outsideHouse = (cells, direction) => {
    if (!list(cell, size, size)(cells) || new Set(cells).size !== size) return false
    const first = cells[0]
    return direction === 'north' ? Math.floor(first / size) === size - 1 && cells.every((index, offset) => index === first - offset * size)
      : direction === 'south' ? Math.floor(first / size) === 0 && cells.every((index, offset) => index === first + offset * size)
        : direction === 'east' ? first % size === 0 && cells.every((index, offset) => index === first + offset)
          : direction === 'west' && first % size === size - 1 && cells.every((index, offset) => index === first - offset)
  }
  const littleKillerRay = (cells, direction) => {
    if (!list(cell, 1, size)(cells) || new Set(cells).size !== cells.length) return false
    const [dr, dc] = direction === 'north-east' ? [-1, 1] : direction === 'south-east' ? [1, 1]
      : direction === 'south-west' ? [1, -1] : [-1, -1]
    const first = cells[0], row = Math.floor(first / size), column = first % size
    const isOutside = (r, c) => r < 0 || r >= size || c < 0 || c >= size
    return isOutside(row - dr, column - dc) && cells.every((index, offset) => index === (row + dr * offset) * size + column + dc * offset) &&
      isOutside(row + dr * cells.length, column + dc * cells.length)
  }
  const drawing = list(list(cell, 1, 128), 1, 128)
  const coversCells = ({ cells, segments }) => new Set(cells).size === cells.length &&
    (segments === undefined || new Set(segments.flat()).size === cells.length &&
      segments.every(part => part.every(index => cells.includes(index))))
  const fractionalPieces = pieces => {
    const width = size * 2, quarterCount = width ** 2
    if (!list(piece => fields(piece, { quarters: list(integer(0, quarterCount - 1), 1, quarterCount),
      color: value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) }) &&
      new Set(piece.quarters).size === piece.quarters.length, 2, quarterCount)(pieces) ||
      !Number.isInteger(2 * size ** 2 * (size + 1) / pieces.length)) return false
    const occupied = new Set()
    for (const piece of pieces) {
      if (piece.quarters.some(quarter => occupied.has(quarter))) return false
      for (const quarter of piece.quarters) occupied.add(quarter)
      const quarters = new Set(piece.quarters), connected = new Set([piece.quarters[0]])
      for (const quarter of connected) {
        const x = quarter % width
        for (const next of [quarter - width, quarter + width, x ? quarter - 1 : -1, x < width - 1 ? quarter + 1 : -1]) {
          if (quarters.has(next)) connected.add(next)
        }
      }
      if (connected.size !== quarters.size) return false
    }
    return occupied.size === quarterCount
  }
  const crustRule = rule => {
    if (!noRegions || !fields(rule, { type: oneOf('crust'), clues: list(clue =>
      fields(clue, { direction: oneOf('north', 'east', 'south', 'west'),
        cells: value => outsideHouse(value, clue.direction), sum: integer(1, size * (size + 1) / 2) },
      { crossed: integer(0, size - 1) }), 1, 4 * size) }, {
        sharedRegion: value => list(cell, 2, 2)(value) && value[0] !== value[1],
        fixedEdges: list(pair, 0, 2 * size * (size - 1)),
      })) return false
    const seen = new Set()
    const { fixedEdges, sharedRegion, clues } = rule
    if (fixedEdges && new Set(fixedEdges.map(([a, b]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size !== fixedEdges.length) return false
    return clues.every(clue => {
      const first = clue.cells[0], key = `${clue.direction}:${first}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }) && (sharedRegion === undefined || sharedRegion[0] !== sharedRegion[1])
  }
  const region = cell => regions ? regions.findIndex(part => part.includes(cell)) : Math.floor(cell / size / boxRows) * (size / boxColumns) + Math.floor(cell % size / boxColumns)
  const sumEnd = value => cell(value) || fields(value, { direction: oneOf('north', 'east', 'south', 'west'), index: integer(0, size - 1) })
  const equationOperator = oneOf('join', 'add', 'subtract', 'multiply', 'divide', 'equals')
  const sumEndKey = end => typeof end === 'number' ? String(end) : `${end.direction}:${end.index}`
  const sumEndCells = end => typeof end === 'number' ? [end] : Array.from({ length: size }, (_, offset) =>
    end.direction === 'south' ? offset * size + end.index : end.direction === 'north' ? (size - 1 - offset) * size + end.index
      : end.direction === 'east' ? end.index * size + offset : end.index * size + size - 1 - offset)
  const entropyGroups = value => Array.isArray(value) && value.length === 3 &&
    value.every(group => list(integer(1, size), 1, size)(group)) &&
    value.flat().length === size && new Set(value.flat()).size === size
  const cornerMarks = value => list(corner => integer(0, size * (size - 1) - 1)(corner) && corner % size !== size - 1,
    0, (size - 1) ** 2)(value) && new Set(value).size === value.length
  const xSumDot = rule => {
    const { ends } = rule
    if (!Array.isArray(ends) || ends.length !== 2 || !ends.every(sumEnd) || ends.every(end => typeof end === 'number') ||
      sumEndKey(ends[0]) === sumEndKey(ends[1])) return false
    const rays = ends.map(sumEndCells), overlap = rays[0].filter(index => rays[1].includes(index))
    if (overlap.length > 1) return false
    if (typeof ends[0] === 'number' || typeof ends[1] === 'number') {
      const given = typeof ends[0] === 'number' ? ends[0] : ends[1]
      const ray = typeof ends[0] === 'number' ? rays[1] : rays[0]
      if (ray[0] !== given) return false
    } else {
      const vertical = end => end.direction === 'north' || end.direction === 'south'
      if (vertical(ends[0]) !== vertical(ends[1]) || overlap.length) return false
    }
    return true
  }
  const lineAssignmentType = type => fields(type, { type: oneOf('renban') }) ||
    (!noRegions && fields(type, { type: oneOf('region-sum') })) ||
    (fields(type, { type: oneOf('entropic'), groups: entropyGroups }) && new Set(type.groups.flat()).size === size)
  const lineAssignments = rule => {
    if (!fields(rule, { type: oneOf('line-assignments'), paths: list(list(cell, 2, size * size), 2, 3),
      types: list(lineAssignmentType, 2, 3) }) || rule.paths.length !== rule.types.length ||
      !rule.paths.every(path => new Set(path).size === path.length) ||
      new Set(rule.types.map(type => type.type)).size !== rule.types.length) return false
    const samePath = (a, b) => a.length === b.length && a.every((index, offset) => index === b[offset])
    return rule.paths.every((path, index) => rule.paths.slice(0, index).every(previous =>
      !samePath(path, previous) && !samePath(path, [...previous].reverse())))
  }
  const occupiedCages = new Set()
  const validCage = cage => {
    if (!fields(cage, { cells: list(cell, 1, size), sum: integer(1, size * (size + 1) / 2) })) return false
    const count = cage.cells.length
    if (cage.sum < count * (count + 1) / 2 || cage.sum > count * (2 * size - count + 1) / 2) return false
    for (const cell of cage.cells) {
      if (occupiedCages.has(cell)) return false
      occupiedCages.add(cell)
    }
    return true
  }
  const valid = rule => fields(rule, { type: oneOf('diagonal'), diagonal: oneOf('main', 'anti') }) ||
    fields(rule, { type: oneOf('anti-king', 'anti-knight') }) ||
    (fields(rule, { type: oneOf('inequality'), less: cell, greater: cell }) && rule.less !== rule.greater && sharesGridEdge(rule.less, rule.greater, size)) ||
    (fields(rule, { type: oneOf('minimum', 'maximum'), cells: list(cell, 1, size * size) },
      { ignoreMarkedNeighbors: boolean, shaded: boolean }) && new Set(rule.cells).size === rule.cells.length &&
      (rule.shaded === undefined || rule.type === 'maximum' && rule.shaded === true)) ||
    (fields(rule, { type: oneOf('digit-restriction'), cells: list(cell, 1, size * size),
      digits: list(integer(1, size), 1, size), shape: oneOf('circle', 'cross', 'square') }) &&
      new Set(rule.cells).size === rule.cells.length && new Set(rule.digits).size === rule.digits.length) ||
    (fields(rule, { type: oneOf('product-cage'), cells: list(cell, 1, size * size),
      product: value => Number.isSafeInteger(value) && value >= (notation === 'zero-based' ? 0 : 1) },
      { color: clueColor }) && new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('digit-count'), cells: list(cell, 1, size * size), digit: integer(1, size),
      minimum: value => Number.isInteger(value) && value >= 1 && value <= rule.cells.length },
      { maximum: value => Number.isInteger(value) && value >= rule.minimum && value <= rule.cells.length }) &&
      new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('zipper'), cells: list(cell, 3, size * size) }) && new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('entropic'), cells: list(cell, 3, size * size + 1), groups: entropyGroups }) && new Set(rule.groups.flat()).size === size) ||
    (fields(rule, { type: oneOf('parity-line'), cells: list(cell, 2, size * size) }) && new Set(rule.cells).size === rule.cells.length &&
      rule.cells.every((index, offset) => offset === 0 || sharesGridEdge(index, rule.cells[offset - 1], size))) ||
    (fields(rule, { type: oneOf('slow-thermometer'), cells: list(cell, 2, size) }) && new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('corner-kropki') }, { consecutive: cornerMarks, ratioTwo: cornerMarks }) &&
      ((rule.consecutive?.length ?? 0) > 0 || (rule.ratioTwo?.length ?? 0) > 0)) ||
    (fields(rule, { type: oneOf('nonogram'), axis: oneOf('row', 'column'), index: integer(0, size - 1),
      digits: list(integer(1, size), 1, size), runs: list(integer(1, size), 1, size) }) &&
      new Set(rule.digits).size === rule.digits.length && rule.runs.reduce((total, run) => total + run, 0) === rule.digits.length &&
      rule.digits.length + rule.runs.length - 1 <= size) ||
    (noRegions && fields(rule, { type: oneOf('fractional-regions'), pieces: fractionalPieces }) ) ||
    crustRule(rule) ||
    (fields(rule, { type: oneOf('row-equation'), cells: list(cell, 3, 5), operators: list(equationOperator, 2, 4) }) &&
      rule.operators.length === rule.cells.length - 1 && rule.cells.every((index, offset) =>
        index === rule.cells[0] + offset && Math.floor(index / size) === Math.floor(rule.cells[0] / size)) &&
      rule.operators.filter(operator => operator === 'equals').length === 1 &&
      rule.operators.every((operator, index) => operator !== 'join' || rule.operators[index - 1] !== 'join')) ||
    (fields(rule, { type: oneOf('x-sum-dot'), ends: list(sumEnd, 2, 2), relation: oneOf('consecutive', 'ratio') }) && xSumDot(rule)) ||
    lineAssignments(rule) ||
    fields(rule, { type: oneOf('parity'), parity: oneOf('odd', 'even'), cells: list(cell, 1, size * size) }) ||
    (fields(rule, { type: oneOf('global-entropy') }, { groups: entropyGroups }) &&
      (rule.groups === undefined ? size === 9 : entropyGroups(rule.groups))) ||
    (fields(rule, { type: oneOf('extra-house'), cells: list(cell, size, size) }) && new Set(rule.cells).size === size) ||
    (fields(rule, { type: oneOf('killer-cages'), cages: list(validCage, 1, size * size) }, { coverGrid: boolean }) &&
      (!rule.coverGrid || rule.cages.reduce((count, cage) => count + cage.cells.length, 0) === size * size)) ||
    fields(rule, { type: oneOf('kropki') }, { consecutive: marks, ratioTwo: marks }) ||
    (fields(rule, { type: oneOf('xv') }, { five: marks, ten: marks }) &&
      [rule.five, rule.ten].some(value => value && ((value.pairs?.length ?? 0) > 0 || value.negative === true)) &&
      new Set([...(rule.five?.pairs ?? []), ...(rule.ten?.pairs ?? [])].map(([a, b]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size ===
        (rule.five?.pairs?.length ?? 0) + (rule.ten?.pairs?.length ?? 0)) ||
    (fields(rule, { type: oneOf('non-consecutive') }, { except: list(pair, 0, 2 * size * (size - 1)) }) &&
      (rule.except === undefined || new Set(rule.except.map(([a, b]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size === rule.except.length)) ||
    (fields(rule, { type: oneOf('clone'), groups: list(group => list(cell, 2, size * size)(group) && new Set(group).size === group.length, 1, size * size) }) ) ||
    (fields(rule, { type: oneOf('between'), cells: list(cell, 3, size * size) }) && new Set(rule.cells).size === rule.cells.length) ||
    (size === 6 && fields(rule, { type: oneOf('modular'), cells: list(cell, 3, size * size) }) && new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('quadruple'), topLeft: integer(0, size * (size - 1) - 1), digits: list(integer(1, size), 1, 4) }) &&
      rule.topLeft % size < size - 1) ||
    numberedDotRule(rule, size) ||
    fields(rule, { type: oneOf('anti-sum'), sum: integer(2, 2 * size) }) ||
    fields(rule, { type: oneOf('adjacent-total'), cells: pair, sum: integer(3, 2 * size - 1) }) ||
    (fields(rule, { type: oneOf('row-column-sum'), pairs: list(pair, 0, 2 * size * (size - 1)) }, { requireUnmarked: boolean }) &&
      (rule.pairs.length > 0 || rule.requireUnmarked === true) &&
      new Set(rule.pairs.map(([a, b]) => Math.min(a, b) * size ** 2 + Math.max(a, b))).size === rule.pairs.length) ||
    fields(rule, { type: oneOf('difference'), cells: pair, difference: integer(1, size - 1) }) ||
    (fields(rule, { type: oneOf('arrow'), circle: cell, cells: list(cell, 1, maxArrowCells) }) &&
      !rule.cells.includes(rule.circle) && new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('whispers'), cells: list(cell, 2, size * size), minDifference: integer(1, size - 1) }) &&
      new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('linked-double-arrow'), ends: list(sumEnd, 2, 2), cells: list(cell, 1, size * size) }) &&
      new Set(rule.cells).size === rule.cells.length && rule.ends.some(end => !cell(end)) &&
      rule.ends.every(end => !cell(end) || !rule.cells.includes(end)) &&
      (!rule.ends.every(end => !cell(end)) || rule.ends[0].direction !== rule.ends[1].direction || rule.ends[0].index !== rule.ends[1].index)) ||
    (fields(rule, { type: oneOf('double-arrow'), ends: list(cell, 2, 2), cells: list(cell, 1, 2 * size) }) &&
      new Set([...rule.ends, ...rule.cells]).size === rule.cells.length + 2) ||
    (fields(rule, { type: oneOf('sandwich'), direction: oneOf('north', 'east', 'south', 'west'),
      cells: value => outsideHouse(value, rule.direction), sum: integer(0, size * (size + 1) / 2 - size - 1) })) ||
    (fields(rule, { type: oneOf('x-sum'), direction: oneOf('north', 'east', 'south', 'west'),
      cells: value => outsideHouse(value, rule.direction), sum: integer(1, size * (size + 1) / 2) })) ||
    (fields(rule, { type: oneOf('skyscrapers'), direction: oneOf('north', 'east', 'south', 'west'),
      index: integer(0, size - 1), count: integer(1, size) })) ||
    (fields(rule, { type: oneOf('little-killer'), direction: diagonalDirection,
      cells: value => littleKillerRay(value, rule.direction), sum: value => Number.isInteger(value) && value >= rule.cells.length && value <= size * rule.cells.length })) ||
    (fields(rule, { type: oneOf('thermometer'), cells: list(cell, 2, size) }) && new Set(rule.cells).size === rule.cells.length) ||
    (fields(rule, { type: oneOf('palindrome'), cells: list(cell, 2, size * size) }) && new Set(rule.cells).size === rule.cells.length &&
      rule.cells.every((index, offset) => offset === 0 || sharesGridEdge(index, rule.cells[offset - 1], size))) ||
    (fields(rule, { type: oneOf('renban'), cells: list(cell, 1, size) }, { segments: drawing }) && coversCells(rule)) ||
    (!noRegions && fields(rule, { type: oneOf('region-sum'), cells: list(cell, 2, size * size) }, { segments: drawing, groupByRegion: boolean }) &&
      coversCells(rule) && new Set(rule.cells.map(region)).size >= 2)
  return list(valid, size === 4 && !regions ? 1 : 0, 128)(value)
}
const ruleAuthor = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 72
const algebraicCage = value => {
  if (!fields(value, { type: oneOf('algebraic-cage'), cells: list(integer(0, 15), 1, 4), label: label => typeof label === 'string',
    total: total => fields(total, { type: oneOf('fixed'), value: integer(1, 10) }) ||
      fields(total, { type: oneOf('variable'), name: name => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name),
        offset: integer(-2147483648, 2147483647) }) })) return false
  const { total } = value
  const label = total.type === 'fixed' ? String(total.value)
    : total.name + (total.offset ? `${total.offset > 0 ? '+' : ''}${total.offset}` : '')
  return value.label === label
}
const algebraic = value => fields(value, { sudokuPad: code => typeof code === 'string' && code.length <= 10_000 && /^(?:scl|ctc)[A-Za-z0-9+/=]+$/i.test(code) }) ||
  (fields(value, { rules: list(algebraicCage, 1, 16) }) &&
    value.rules.some(rule => rule.total.type === 'variable') &&
    new Set(value.rules.flatMap(rule => rule.cells)).size === value.rules.reduce((count, rule) => count + rule.cells.length, 0))
const cell = integer(0, 80)
const cells = list(cell, 1, 81)
const uniqueCells = (minimum, maximum) => value =>
  list(cell, minimum, maximum)(value) && new Set(value).size === value.length
const clueColor = value => typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
const cellColor = value => typeof value === 'string' && (clueColor(value) ||
  /^(?:(?:white|grey|lime|blue|purple|red|green|yellow|orange|cyan|magenta)(?:Heavy)?|error)$/.test(value))
const cellColors = value => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.entries(value).every(([site, shades]) => /^(?:[0-9]|[1-7][0-9]|80)$/.test(site) &&
    list(cellColor, 1, 62)(shades) && new Set(shades).size === shades.length)
const regionLegend = (value, regions, size) => {
  if (!Array.isArray(regions) || regions.length !== size || Object.keys(value).length !== size ** 2) return false
  const legend = new Set()
  for (const region of regions) {
    const shade = value[region[0]]?.[0]
    if (!shade || legend.has(shade) || region.some(cell => value[cell]?.length !== 1 || value[cell]?.[0] !== shade)) return false
    legend.add(shade)
  }
  return legend.size === size
}
const givenCellColors = (value, variant, grid) => {
  if (!cellColors(value)) return false
  if (grid) return !Array.isArray(grid.regions) || Object.keys(value).length !== grid.size ** 2 ||
    regionLegend(value, grid.regions, grid.size)
  if (!variant) return true
  const regions = variant.puzzle.regions
  if (variant.fog) return false
  if (regions?.type !== 'jigsaw') return true
  if (Object.keys(value).length !== 81) return true
  return regionLegend(value, regions.regions, 9)
}
const artworkSize = value => typeof value === 'number' && value > 0 && value <= .5
const artworkCorner = list(integer(0, 9), 2, 2)
const artworkCenter = list(value => typeof value === 'number' && value >= .5 && value <= 8.5 && Number.isInteger(value - .5), 2, 2)
const closedArtworkOutline = points => list(artworkCorner, 4, 128)(points) &&
  points[0].every((coordinate, axis) => coordinate === points.at(-1)[axis])
const artworkDivider = points => list(artworkCorner, 2, 128)(points) &&
  points.slice(1).every(([x, y], i) => (x === points[i][0]) !== (y === points[i][1]))
const artworkPoint = list(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 9, 2, 2)
const artworkTile = mark => fields(mark, {
  type: oneOf('tile'), center: artworkPoint,
  size: value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1,
  rotation: value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 360,
  color: value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
  opacity: value => Number.isInteger(value) && value >= 0 && value <= 255,
})
const artworkText = mark => fields(mark, {
  type: oneOf('text'), center: artworkPoint,
  text: value => typeof value === 'string' && value.length > 0 && value.length <= 100,
  size: value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 2,
  color: value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
  opacity: value => Number.isInteger(value) && value >= 0 && value <= 255,
  outlineColor: value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
  outlineThickness: value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= .1,
  offsetY: value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1,
})
const authoredArtwork = list(mark => fields(mark, { type: oneOf('outline'), points: closedArtworkOutline, thickness: artworkSize }) ||
  fields(mark, { type: oneOf('divider'), points: artworkDivider, thickness: artworkSize }) ||
  fields(mark, { type: oneOf('disc'), center: artworkCenter, radius: artworkSize,
    color: value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) }) || artworkTile(mark) || artworkText(mark), 1, 512)
const pairs = list(list(cell, 2, 2), 0)
const house = list(cell, 9, 9)
const direction = oneOf('north', 'east', 'south', 'west')
const marks = value => fields(value, {}, { pairs, negative: boolean })
const regions = value => fields(value, { type: oneOf('boxes') }) ||
  (fields(value, { type: oneOf('jigsaw'), regions: list(house, 9, 9) }) && new Set(value.regions.flat()).size === 81) ||
  (fields(value, { type: oneOf('partial'), regions: list(uniqueCells(9, 9), 0, 9) }) &&
    new Set(value.regions.flat()).size === 9 * value.regions.length && value.regions.every(part => connectedRegion(part, 9)))
const segments = list(list(cell, 1), 1)
const diagonalDirection = oneOf('north-east', 'south-east', 'south-west', 'north-west')
function insideGridRows(rows) {
  if (!list(uniqueCells(2, 5), 2, 5)(rows)) return false
  const size = rows.length
  if (rows.some(row => row.length !== size) || new Set(rows.flat()).size !== size ** 2) return false
  const rowOf = cell => Math.floor(cell / 9)
  const colOf = cell => cell % 9
  const start = rows[0][0], right = rows[0][1], down = rows[1][0]
  const dr = rowOf(down) - rowOf(start), dc = colOf(down) - colOf(start)
  const rr = rowOf(right) - rowOf(start), rc = colOf(right) - colOf(start)
  return [dr, dc, rr, rc].every(step => Math.abs(step) === 1) && dr * rr + dc * rc === 0 &&
    rows.every((row, i) => row.every((cell, j) =>
      rowOf(cell) === rowOf(start) + i * dr + j * rr && colOf(cell) === colOf(start) + i * dc + j * rc))
}
const quadrupleCorner = value => cell(value) && value < 72 && value % 9 < 8
const quadruple = [{ topLeft: quadrupleCorner, digits: list(integer(1, 9), 1, 4) }]
const letteredCircle = clue => fields(clue, { topLeft: quadrupleCorner,
  letters: value => typeof value === 'string' && /^[A-Z]{1,4}$/.test(value) })
const letteredClues = clues => list(letteredCircle, 1, 64)(clues) &&
  new Set(clues.map(clue => clue.topLeft)).size === clues.length &&
  new Set(clues.flatMap(clue => [...clue.letters])).size <= 9
const neighborMatchClues = clues => list(clue => fields(clue, { cell, digit: integer(1, 9) }), 1)(clues) &&
  new Set(clues.map(clue => clue.cell)).size === clues.length
const aqreCount = value => fields(value, { type: oneOf('fixed'), value: integer(0, 81) }) ||
  fields(value, { type: oneOf('digit-cell'), cell })
const aqreRegion = value => fields(value, { cells: uniqueCells(1, 81) }, { count: aqreCount }) &&
  connectedCells(value.cells, 9) && (!value.count || value.count.type === 'fixed'
    ? !value.count || value.count.value <= value.cells.length
    : value.cells.includes(value.count.cell))
const aqreRule = value => fields(value, {
  type: oneOf('aqre'), kind: oneOf('snake', 'plus'), regions: list(aqreRegion, 1, 81),
  givenShades: list(shade => fields(shade, { cell, shade: oneOf('unshaded', 'shaded') }), 0, 81),
}) && value.regions.every(region => region.cells.every(cell => !value.regions.some(other =>
  other !== region && other.cells.includes(cell)))) &&
  value.regions.reduce((count, region) => count + region.cells.length, 0) === 81 &&
  new Set(value.regions.flatMap(region => region.cells)).size === 81 &&
  new Set(value.givenShades.map(shade => shade.cell)).size === value.givenShades.length &&
  (value.kind !== 'plus' || value.regions.every(region => region.count?.type === 'digit-cell'))
const ruleFields = {
  'adjacent-total': [{ cells: list(cell, 2, 2), sum: integer(3, 17) }],
  between: [{ cells: list(cell, 3, 81) }],
  lockout: [{ cells: uniqueCells(2, 81) }],
  clone: [{ groups: list(list(cell, 2, 81), 1) }],
  entropic: [{ cells: list(cell, 1) }],
  'entropy-window-group': [{ cells: list(cell, 4, 4), group: oneOf('low', 'middle', 'high') }],
  'global-entropy': [{}],
  inequality: [{ less: cell, greater: cell }],
  minimum: [{ cells: uniqueCells(1, 81) }, { ignoreMarkedNeighbors: boolean }],
  maximum: [{ cells: uniqueCells(1, 81) }, { ignoreMarkedNeighbors: boolean }],
  'little-killer': [{ direction: diagonalDirection, cells: list(cell, 1, 9), sum: integer(1, 81) }],
  modular: [{ cells: list(cell, 1) }],
  palindrome: [{ cells }, { segments }],
  'region-sum': [{ cells }, { groupByRegion: boolean, segments }],
  renban: [{ cells: list(cell, 1, 9) }, { segments }],
  whispers: [{ cells: list(cell, 2, 82), minDifference: integer(1, 8) }],
  'x-sum': [{ direction, cells: house, sum: integer(1, 45) }],
  xv: [{}, { five: marks, ten: marks }],
  'anti-king': [{}],
  'anti-knight': [{}],
  arrow: [{ circle: cell, cells }],
  'pill-arrow': [{ pill: uniqueCells(2, 2), cells: uniqueCells(1, 79) }, { fromTens: boolean }],
  diagonal: [{ diagonal: oneOf('main', 'anti') }],
  'extra-house': [{ cells: house }],
  'distinct-cells': [{ cells: uniqueCells(2, 8) }, { color: clueColor }],
  'consecutive-run': [{ cells: uniqueCells(2, 9) }, { color: clueColor, fromBulb: boolean }],
  'inside-grid': [{ rows: insideGridRows }],
  'killer-cages': [{ cages: list(value => fields(value, { cells, sum: integer(1, 45) }), 1) }, { coverGrid: boolean }],
  kropki: [{}, { consecutive: marks, ratioTwo: marks }],
  'non-consecutive': [{}, { except: pairs }],
  parity: [{ cells, parity: oneOf('odd', 'even') }],
  quadruple,
  'lettered-quadruples': [{ clues: letteredClues }],
  'neighbor-match': [{ clues: neighborMatchClues }],
  'quadruple-sum': quadruple,
  sandwich: [{ direction, cells: house, sum: integer(0, 35) }],
  skyscrapers: [{ direction, cells: house, count: integer(1, 9) }],
  thermometer: [{ cells: list(cell, 2, 81) }],
}
const rule = value => {
  if (value?.type === 'labeled-dots') return numberedDotRule(value, 9)
  if (value?.type === 'aqre') return aqreRule(value)
  if (typeof value?.type !== 'string' || !Object.hasOwn(ruleFields, value.type)) return false
  const [required, optional] = ruleFields[value.type]
  if (!fields(value, { type: oneOf(value.type), ...required }, optional)) return false
  if (value.type === 'entropy-window-group') {
    const [topLeft, topRight, bottomLeft, bottomRight] = value.cells
    return topLeft < 72 && topLeft % 9 < 8 && topRight === topLeft + 1 &&
      bottomLeft === topLeft + 9 && bottomRight === topLeft + 10
  }
  if (value.type !== 'pill-arrow') return true
  const [a, b] = value.pill
  return Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) <= 1 && Math.abs(a % 9 - b % 9) <= 1 &&
    !value.cells.some(cell => value.pill.includes(cell))
}
const variantRules = value => list(rule, 0)(value) && value.filter(rule => rule.type === 'lettered-quadruples').length <= 1
const variant = (value, grid) => fields(value, {
  id: id => typeof id === 'string' && (['jigsaw', 'windoku', 'mixed'].includes(id) || Object.hasOwn(ruleFields, id)),
  puzzle: puzzle => fields(puzzle, { version: oneOf(1), givens: oneOf(grid) }, { regions, rules: variantRules }),
}, { fog: fog => value.id === 'mixed' && fields(fog, { initialCells: cells }, { cellColors }) && new Set(fog.initialCells).size === fog.initialCells.length })
const collection = value => fields(value, {
  collectionId: id => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id),
  puzzleId: id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id),
})

function canonicalDefinition(data) {
  return JSON.stringify(data, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)
}

async function sharePuzzle(request, db, path) {
  if (path === 'shares' && request.method === 'POST') {
    const data = await input(request, maxDefinitionBytes, 'This puzzle definition is too large to share.')
    if (!fields(data, {
      version: oneOf(1), title: title => typeof title === 'string' && title.trim().length > 0 && title.length <= 72,
      givens: value => givens(value, data.grid?.size),
    }, { grid: sizedGrid, algebraic: value => data.grid?.size === 4 && algebraic(value),
      sixRules: value => data.grid?.size === 6 && rectangularGrid(data.grid) && sizedRules(value, data.grid) && !Object.hasOwn(data, 'sizedRules'),
      sixAuthor: value => Object.hasOwn(data, 'sixRules') && ruleAuthor(value),
      sizedRules: value => sizedGrid(data.grid) &&
        !Object.hasOwn(data, 'algebraic') && sizedRules(value, data.grid),
      sizedAuthor: value => Object.hasOwn(data, 'sizedRules') && ruleAuthor(value),
      variant: value => data.grid === undefined && variant(value, data.givens), collection,
      givenCellColors: value => data.variant?.fog === undefined && givenCellColors(value, data.variant, data.grid),
      authoredArtwork: value => data.grid === undefined && data.variant && data.variant.fog === undefined && authoredArtwork(value),
      whispersGuide: value => data.variant?.id === 'whispers' && value === true }) ||
      (data.grid && data.grid.size !== 4 && !Object.hasOwn(data, 'sixRules') && !Object.hasOwn(data, 'sizedRules'))) {
      throw new HttpError(400, 'Invalid puzzle definition.')
    }
    const id = crypto.randomUUID()
    const definition = canonicalDefinition({ ...data, title: data.title.trim() })
    const key = await digest(definition)
    const result = await db.prepare(`INSERT INTO shared_puzzles (id, fingerprint, definition) VALUES (?, ?, ?)
      ON CONFLICT(fingerprint) DO NOTHING`).bind(id, key, definition).run()
    if (result.meta.changes) return json({ id }, 201)
    const existing = await db.prepare('SELECT id FROM shared_puzzles WHERE fingerprint = ?').bind(key).first('id')
    return json({ id: existing })
  }
  if (path.startsWith('shares/') && request.method === 'GET') {
    const id = path.slice('shares/'.length)
    const definition = shareIdPattern.test(id) && await db.prepare('SELECT definition FROM shared_puzzles WHERE id = ?')
      .bind(id.toLowerCase()).first('definition')
    if (!definition) throw new HttpError(404, 'This puzzle link is unavailable.')
    return json(JSON.parse(definition))
  }
  throw new HttpError(405, 'Method not allowed.')
}

async function api(request, { DB: db, SYNC_EVENTS: events }, ctx, url) {
  function notify(library, message, device) {
    if (!events) return
    ctx.waitUntil(Promise.resolve().then(async () => {
      const id = typeof library === 'function' ? await library() : library
      if (id) await events.getByName(id).notify(message, device)
    }).catch(() => console.warn('Could not deliver a sync notification.')))
  }
  const path = url.pathname.slice(base.length)
  const method = request.method
  if (path.startsWith('import/')) return loadPublicPuzzle(request, path)
  if (path === 'health') {
    if (method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    return (await db.prepare('SELECT 1 AS ok').first('ok')) === 1 ? json({ ok: true }) : json({ ok: false }, 503)
  }
  if (method !== 'GET' && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) {
    throw new HttpError(403, 'Unexpected request origin.')
  }
  if (path === 'shares' || path.startsWith('shares/')) return sharePuzzle(request, db, path)
  if (method === 'POST' && ['libraries', 'join', 'recover'].includes(path)) {
    const data = path === 'libraries' && request.body === null ? {} : await input(request)
    const id = crypto.randomUUID(), token = secret(), tokenHash = await digest(token), now = Date.now()
    const name = deviceName(id, data.name)
    const insert = 'INSERT INTO devices(id, token_hash, name, created, library) '
    if (path === 'libraries') {
      const library = crypto.randomUUID(), recovery = secret()
      await db.batch([
        db.prepare('INSERT INTO libraries(id, recovery_hash) VALUES (?, ?)').bind(library, await digest(recovery)),
        db.prepare(insert + 'VALUES (?, ?, ?, ?, ?)').bind(id, tokenHash, name, now, library),
      ])
      return json({ id, token, recovery }, 201)
    }
    if (!secretPattern.test(data.secret ?? '')) throw new HttpError(400, 'Invalid link or recovery key.')
    const key = await digest(data.secret)
    let result
    if (path === 'join') {
      const [enrollment] = await db.batch([
        db.prepare(insert + 'SELECT ?, ?, ?, ?, library FROM invitations WHERE ticket_hash = ? AND expires > ?')
          .bind(id, tokenHash, name, now, key, now),
        db.prepare('DELETE FROM invitations WHERE ticket_hash = ?').bind(key),
      ])
      result = enrollment
    } else {
      result = await db.prepare(insert + 'SELECT ?, ?, ?, ?, id FROM libraries WHERE recovery_hash = ?')
        .bind(id, tokenHash, name, now, key).run()
    }
    if (!result.meta.changes) throw new HttpError(403, 'The link or recovery key is invalid or expired.')
    notify(() => db.prepare('SELECT library FROM devices WHERE id = ?').bind(id).first('library'), 'devices')
    return json({ id, token }, 201)
  }
  const upgrade = path === 'live'
  if (!upgrade && !/^(invitations|devices(?:\/[\w-]+)?|settings|changes|puzzles\/[\w-]+)$/.test(path)) throw new HttpError(404, 'Not found.')
  let raw = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  let wantsPresence = false
  if (upgrade) {
    if (!events) throw new HttpError(503, 'Live sync is unavailable.')
    if (method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new HttpError(426, 'Expected a WebSocket upgrade.')
    }
    if (request.headers.get('Origin') !== url.origin) throw new HttpError(403, 'Unexpected request origin.')
    // Browsers cannot set Authorization on a WebSocket. Use the unselected
    // subprotocol for the token so it stays out of request URLs and responses.
    const [protocol, token, feature] = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(value => value.trim())
    raw = protocol === 'sudoku-sync' && secretPattern.test(token ?? '') ? token : undefined
    wantsPresence = feature === 'sudoku-sync-presence'
  }
  const includeSettings = path === 'changes' && url.searchParams.has('settings')
  const authQuery = includeSettings
    ? 'SELECT devices.id, library, settings FROM devices JOIN libraries ON libraries.id = devices.library WHERE token_hash = ?'
    : 'SELECT id, library FROM devices WHERE token_hash = ?'
  const device = raw && await db.prepare(authQuery).bind(await digest(raw)).first()
  if (!device) throw new HttpError(401, 'This device is no longer linked.')
  const { library } = device
  if (upgrade) {
    const headers = new Headers({ Upgrade: 'websocket', 'X-Sync-Device': device.id })
    if (wantsPresence) headers.set('X-Sync-Presence', '1')
    return events.getByName(library).fetch(new Request(request.url, {
      headers,
    }))
  }
  if (path === 'invitations' && method === 'POST') {
    const ticket = secret(), now = Date.now(), expires = now + 10 * 60_000
    await db.batch([
      db.prepare('DELETE FROM invitations WHERE expires <= ?').bind(now),
      db.prepare('INSERT INTO invitations(ticket_hash, issuer, library, expires) VALUES (?, ?, ?, ?)').bind(await digest(ticket), device.id, library, expires),
    ])
    return json({ ticket, expires }, 201)
  }
  if (path === 'devices' && method === 'GET') {
    return json((await db.prepare('SELECT id, name, created FROM devices WHERE library = ? ORDER BY created').bind(library).all()).results)
  }
  if (path.startsWith('devices/') && method === 'PATCH') {
    const id = path.slice('devices/'.length)
    const data = await input(request)
    if (!Object.hasOwn(data, 'name')) throw new HttpError(400, 'Missing device name.')
    const name = deviceName(id, data.name)
    const result = await db.prepare('UPDATE devices SET name = ? WHERE library = ? AND id = ?').bind(name, library, id).run()
    if (!result.meta.changes) throw new HttpError(404, 'Device not found.')
    notify(library, 'devices')
    return json({ name })
  }
  if (path.startsWith('devices/') && method === 'DELETE') {
    const id = path.slice(8)
    const result = await db.prepare('DELETE FROM devices WHERE library = ? AND id = ?').bind(library, id).run()
    if (result.meta.changes) notify(library, 'revoked', id)
    return json({ ok: true })
  }
  if (path === 'settings' && method === 'PATCH') {
    const { seeds, edits } = await input(request, 32 * 1024)
    for (const map of [seeds, edits]) {
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new HttpError(400, 'Invalid settings.')
      for (const [key, value] of Object.entries(map)) {
        if (!/^[a-z][a-zA-Z0-9.-]{0,79}$/.test(key) || typeof value !== 'string') throw new HttpError(400, 'Invalid setting.')
        try { JSON.parse(value) } catch { throw new HttpError(400, 'Invalid setting value.') }
      }
    }
    // Existing choices win over enrollment seeds. Later edits change only their individual fields.
    const update = 'json_patch(json_patch(?, settings), ?)'
    const result = await db.prepare('UPDATE libraries SET settings = ' + update +
      ' WHERE id = ? AND length(CAST(' + update + ' AS BLOB)) <= 65536 RETURNING settings')
      .bind(JSON.stringify(seeds), JSON.stringify(edits), library, JSON.stringify(seeds), JSON.stringify(edits)).first('settings')
    if (result == null) throw new HttpError(413, 'Settings are too large to sync.')
    notify(library, 'changes', device.id)
    return json(JSON.parse(result))
  }
  if (path === 'changes' && method === 'GET') {
    const after = Number(url.searchParams.get('after') ?? 0)
    if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, 'Invalid cursor.')
    const changes = (await db.prepare('SELECT id, revision, sequence FROM puzzles WHERE library = ? AND sequence > ? ORDER BY sequence LIMIT 100')
      .bind(library, after).all()).results
    return json(includeSettings ? { changes, settings: JSON.parse(device.settings) } : changes)
  }
  if (path.startsWith('puzzles/')) {
    const id = path.slice(8)
    if (!idPattern.test(id)) throw new HttpError(400, 'Invalid puzzle ID.')
    if (method === 'GET') {
      const row = await db.prepare('SELECT revision, hash, played, elapsed, body FROM puzzles WHERE library = ? AND id = ?').bind(library, id).first()
      return row ? json({ ...row, game: row.body && JSON.parse(row.body), body: undefined }) : json({ error: 'Unknown puzzle.' }, 404)
    }
    if (method === 'PUT') {
      const { revision, hash, played, game } = await input(request, maxBytes)
      if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(played) || played < 0 ||
        (game === null ? hash !== 'deleted' : !secretPattern.test(hash) || game?.id !== id ||
          !Number.isSafeInteger(game.elapsed) || game.elapsed < 0 || typeof game.title !== 'string' || !game.position)) {
        throw new HttpError(400, 'Invalid puzzle save.')
      }
      let body = null
      if (game) {
        // Older clients send the local save-prompt flag but omit it from the fingerprint.
        const { pendingSave, ...save } = game
        const { elapsed, savedForLater, ...content } = save
        if (await digest(JSON.stringify(content)) !== hash) throw new HttpError(400, 'Puzzle fingerprint does not match the save.')
        body = JSON.stringify(save)
      }
      const sequence = '(SELECT COALESCE(MAX(sequence), 0) + 1 FROM puzzles WHERE library = ?)'
      // Both the revision check and sequence allocation happen in one SQLite statement.
      const result = revision === 0
        ? await db.prepare('INSERT INTO puzzles(library,id,revision,sequence,hash,played,elapsed,body) VALUES (?,?,1,' + sequence + ',?,?,?,?) ON CONFLICT(library,id) DO NOTHING')
          .bind(library, id, library, hash, played, game?.elapsed ?? 0, body).run()
        : await db.prepare('UPDATE puzzles SET revision = revision + 1, sequence = ' + sequence + ', hash = ?, played = ?, elapsed = ?, body = ? WHERE library = ? AND id = ? AND revision = ? AND body IS NOT NULL')
          .bind(library, hash, played, game?.elapsed ?? 0, body, library, id, revision).run()
      if (!result.meta.changes) throw new HttpError(409, 'Puzzle changed on another device.')
      notify(library, 'changes', device.id)
      return json({ revision: revision + 1 })
    }
  }
  throw new HttpError(405, 'Method not allowed.')
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!url.pathname.startsWith(base)) return json({ error: 'Not found.' }, 404)
    try { return await api(request, env, ctx, url) }
    catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      if (url.pathname === base + 'health') return json({ ok: false }, 503)
      const service = url.pathname === base + 'shares' || url.pathname.startsWith(base + 'shares/') ? 'Sharing' : 'Sync'
      return json({ error: `${service} service unavailable.` }, 503)
    }
  },
}
