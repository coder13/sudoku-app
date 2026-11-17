import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { validateContent } from './validate.mjs'
import foundationVisuals from '../../src/sudoku/foundation-visuals.json' with { type: 'json' }

const root = fileURLToPath(new URL('../../', import.meta.url))
const dataFile = join(root, 'src/sudoku/learn-content.json')
const generated = join(root, 'src/sudoku/generated')
const exampleFile = join(generated, 'lesson-examples.json')
const host = '127.0.0.1'
const port = Number(process.env.LESSON_EDITOR_PORT ?? 5180)
const origin = `http://${host}:${port}`
const prefix = '/__lesson-editor'
const api = prefix + '/content'
const assets = new Map([
  [prefix + '/', ['index.html', 'text/html; charset=utf-8']],
  [prefix + '/editor.js', ['editor.js', 'text/javascript; charset=utf-8']],
  [prefix + '/preview.js', ['preview.js', 'text/javascript; charset=utf-8']],
  [prefix + '/editor.css', ['editor.css', 'text/css; charset=utf-8']],
])
const previewArticles = new Map([
  [join(root, 'src/routes/learn.index.tsx'), 'lesson-overview'],
  [join(root, 'src/components/TechniqueLesson.tsx'), 'technique-lesson'],
])

if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LESSON_EDITOR_PORT must be between 1024 and 65535.')
if (['engine.wasm', 'lesson-examples.json', 'lesson-difficulties.json'].some((file) => !existsSync(join(generated, file)))) {
  const result = spawnSync(process.execPath, ['scripts/build-wasm.mjs'], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const revisionOf = (source) => createHash('sha256').update(source).digest('hex')
function readContent() {
  const source = readFileSync(dataFile, 'utf8')
  return { content: JSON.parse(source), revision: revisionOf(source) }
}
function readExamples() {
  return Object.keys(JSON.parse(readFileSync(exampleFile, 'utf8'))).sort()
}
function json(response, status, result) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(result))
}

async function handleContent(request, response, vite) {
  if (request.method === 'GET') {
    json(response, 200, { ...readContent(), examples: readExamples(),
      foundationVisuals: Object.fromEntries(Object.entries(foundationVisuals).map(([id, visual]) => [id, visual.title])) })
    return
  }
  if (request.method !== 'PUT') return json(response, 405, { error: 'Use GET or PUT.' })
  if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') {
    return json(response, 403, { error: 'Open the editor at its printed local address to save.' })
  }

  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size <= 1024 * 1024) chunks.push(chunk)
  }
  if (size > 1024 * 1024) return json(response, 413, { error: 'The lesson file is too large.' })

  let draft
  try {
    draft = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return json(response, 400, { error: 'This save did not contain valid JSON.' })
  }

  const current = readContent()
  if (draft?.revision !== current.revision) {
    return json(response, 409, { error: 'The lesson file changed on disk. Copy any unsaved edits you want to keep, then reload the editor.' })
  }
  try {
    validateContent(draft.content, current.content, readExamples())
  } catch (error) {
    return json(response, 422, { error: error.message })
  }

  const source = JSON.stringify(draft.content, null, 2) + '\n'
  if (revisionOf(source) !== current.revision) {
    const temporary = `${dataFile}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, source, { flag: 'wx' })
      renameSync(temporary, dataFile)
    } finally {
      rmSync(temporary, { force: true })
    }
    // Reload can arrive before the filesystem watcher processes the atomic rename.
    // Invalidate both client and SSR module graphs before returning from Save.
    invalidateContent(vite)
  }
  json(response, 200, { revision: revisionOf(source) })
}

function invalidateContent(vite) {
  for (const environment of Object.values(vite.environments)) {
    const modules = environment.moduleGraph.getModulesByFile(dataFile)
    if (!modules) continue
    for (const module of modules) environment.moduleGraph.invalidateModule(module)
  }
}

const vite = await createServer({
  root,
  server: { host, port, strictPort: true, hmr: false },
  plugins: [{
    name: 'local-lesson-editor',
    enforce: 'pre',
    transform(source, id) {
      const article = previewArticles.get(id.split('?')[0])
      if (!article) return
      // Wait for the article's own hydration commit before touching its DOM.
      return source.replace(`<article className="${article}">`, `<article className="${article}" ref={(element) => { element?.setAttribute('data-preview-ready', '') }}>`)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]
        if (path !== prefix && !path?.startsWith(prefix + '/')) return next()
        if (request.headers.host !== `${host}:${port}`) return json(response, 403, { error: 'Use the printed editor address.' })
        if (path === api) {
          void handleContent(request, response, server).catch((error) => {
            console.error(error)
            if (!response.headersSent) json(response, 500, { error: 'Could not access the lesson file. Check the terminal for details.' })
          })
          return
        }
        if (path === prefix) {
          response.writeHead(302, { Location: prefix + '/' })
          return response.end()
        }
        const asset = assets.get(path)
        if (request.method !== 'GET' || !asset) return json(response, 404, { error: 'Editor resource unavailable.' })
        const [file, contentType] = asset
        response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
        response.end(readFileSync(new URL(file, import.meta.url)))
      })
    },
  }],
})
await vite.listen()
console.log(`Lesson editor  ${origin}${prefix}/`)
