import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))

test('the deploy packages all 66 committed packs with no constructor, engine binary, or research tools', t => {
  const site = mkdtempSync(join(tmpdir(), 'sinclair-deploy-'))
  t.after(() => rmSync(site, { recursive: true, force: true }))
  mkdirSync(join(site, 'scripts'))
  for (const name of ['build-collections.mjs', 'pack-sinclair-library.mjs']) {
    cpSync(join(root, 'scripts', name), join(site, 'scripts', name))
  }
  cpSync(join(root, 'package.json'), join(site, 'package.json'))
  cpSync(join(root, 'data', 'sinclair'), join(site, 'data', 'sinclair'), { recursive: true })
  const sudoku = join(root, 'src', 'sudoku')
  cpSync(sudoku, join(site, 'src', 'sudoku'), {
    recursive: true,
    filter: path => dirname(path) !== sudoku || (basename(path) !== 'generated' &&
      (!basename(path).startsWith('sinclair-') || basename(path) === 'sinclair-format.ts')),
  })
  const build = () => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-collections.mjs'],
    { cwd: site, env: { PATH: '' }, stdio: 'pipe' })
  build()
  const output = join(site, 'public', 'collections')
  const families = readdirSync(output).filter(name => name.startsWith('sinclair-library-'))
  assert.equal(families.length, 9)
  assert.equal(families.reduce((count, name) => count + readdirSync(join(output, name)).length, 0), 66)
  for (const family of families) for (const filename of readdirSync(join(output, family))) {
    assert.equal(JSON.parse(readFileSync(join(output, family, filename), 'utf8')).puzzles.length, 100)
  }
  unlinkSync(join(site, 'data', 'sinclair', 'classic', 'impossible.json'))
  assert.throws(build, /ENOENT.*impossible\.json/)
})
