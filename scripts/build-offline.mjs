import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = new URL('../dist/client/', import.meta.url)
const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name !== 'sw.js' && !entry.name.endsWith('.map'))
  .map((entry) => {
    const path = relative(fileURLToPath(directory), join(entry.parentPath, entry.name))
    return '/' + path.split(sep).map(encodeURIComponent).join('/')
  })
  .sort()

if (!files.includes('/index.html') || !files.some((path) => path.endsWith('.wasm'))) {
  throw new Error('The production shell or Sudoku engine is missing from dist/client.')
}

const worker = await readFile(new URL('./worker.js', import.meta.url), 'utf8')
const hash = createHash('sha256').update(worker)
for (const file of files) {
  const asset = new URL('.' + file, directory)
  let content = await readFile(asset)
  if (file.endsWith('.html')) {
    const html = content.toString('utf8')
    // React can hoist stylesheet links ahead of the inline script and delay the saved theme.
    const themeTags = /<meta name="(?:color-scheme|theme-color)"[^>]*>|<script id="startup-theme">[\s\S]*?<\/script>/g
    const stylesheet = /<link rel="stylesheet"/
    const tags = html.match(themeTags)
    if (tags?.length === 3 && stylesheet.test(html)) {
      const reordered = html.replace(themeTags, '').replace(stylesheet, (link) => tags.join('') + link)
      if (reordered !== html) {
        content = Buffer.from(reordered)
        await writeFile(asset, content)
      }
    }
  }
  hash.update(file)
  hash.update(content)
}
const revision = hash.digest('hex').slice(0, 16)
const source = `const cacheName = 'sudoku-app-shell-${revision}'\nconst assets = ${JSON.stringify(files)}\n\n${worker}`
await writeFile(new URL('sw.js', directory), source)
