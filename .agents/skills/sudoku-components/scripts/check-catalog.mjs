// Run from any directory. TypeScript's parser handles multiline signatures and wrapped components.
import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const src = join(root, 'src')
const catalog = readFileSync(new URL('../references/components.md', import.meta.url), 'utf8')
const documented = new Set()
for (const line of catalog.split('\n')) {
  const row = /^\| \[[^\]]+\]\(\.\.\/\.\.\/\.\.\/\.\.\/src\/([^)]*\.tsx)\) \| (.+) \|$/.exec(line)
  if (row) for (const [, name] of row[2].matchAll(/`([A-Z][a-zA-Z0-9]*)`/g)) documented.add(row[1] + '#' + name)
}
const components = new Set()
for (const file of readdirSync(src, { recursive: true }).filter(file => file.endsWith('.tsx'))) {
  const tree = ts.createSourceFile(file, readFileSync(join(src, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text)) {
      const init = ts.isVariableDeclaration(node) && node.initializer
      if (ts.isFunctionDeclaration(node) || init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init) ||
        ts.isCallExpression(init) && /^(?:React\.)?(?:memo|forwardRef|lazy)$/.test(init.expression.getText(tree)))) {
        components.add(file.replaceAll('\\', '/') + '#' + node.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
}
const missing = [...components].filter(id => !documented.has(id))
const stale = [...documented].filter(id => !components.has(id))
if (missing.length || stale.length) {
  if (missing.length) console.error('Add usage guidance for', missing.join(', '))
  if (stale.length) console.error('Update removed or renamed entries for', stale.join(', '))
  process.exitCode = 1
} else console.log('Component catalog covers ' + components.size + ' named components.')
