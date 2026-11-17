import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appEngineProfile, featuresForProfile } from './engine-build-profiles.mjs'

export async function buildBrowserEngine(profile = appEngineProfile, outputDirectory = 'src/sudoku/generated') {
  const features = featuresForProfile(profile)
  const target = resolve(process.env.CARGO_TARGET_DIR ?? 'target')
  execFileSync('cargo', [
    'rustc', '--lib', '--locked', '--release', '-p', 'sudoku-app-engine', '--no-default-features', '--features', features.join(','),
    '--target', 'wasm32-unknown-unknown', '--target-dir', target,
    '--', '-C', 'link-arg=--strip-all',
  ], { stdio: 'inherit' })

  const bytes = readFileSync(resolve(target, 'wasm32-unknown-unknown/release/sudoku_app_engine.wasm'))
  const { instance } = await WebAssembly.instantiate(bytes)
  const engine = instance.exports

  function request(type, options = {}) {
    const input = new TextEncoder().encode(JSON.stringify({ type, ...options }))
    const address = engine.request_buffer(input.length)
    new Uint8Array(engine.memory.buffer, address, input.length).set(input)
    const length = engine.run_request()
    const response = new Uint8Array(engine.memory.buffer, engine.response_buffer(), length)
    const { value, error } = JSON.parse(new TextDecoder().decode(response))
    if (!value) throw new Error(error ?? `The engine returned no result for ${type}.`)
    return value
  }

  const capabilities = request('capabilities')
  const examples = capabilities.teaching ? request('lesson-examples') : {}
  const { techniques } = request('techniques', { variant: capabilities.variants })
  if (capabilities.teaching && capabilities.variants) {
    for (const { id } of techniques) {
      if (examples[id]) continue
      const [diagram, practice] = request('practice-examples', { variant: true, technique: id })
      if (!diagram || !practice) throw new Error(`Missing variant lesson examples for ${id}.`)
      examples[id] = { ...diagram, practice }
    }
  }
  const difficulties = Object.fromEntries(techniques.map(({ id, difficulty }) => [id, difficulty]))
  const aliases = Object.fromEntries([...request('techniques').techniques, ...techniques]
    .filter(({ aliases }) => aliases.length)
    .map(({ id, aliases }) => [id, aliases]))

  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(resolve(outputDirectory, 'engine.wasm'), bytes)
  if (capabilities.teaching) {
    writeFileSync(resolve(outputDirectory, 'lesson-examples.json'), `${JSON.stringify(examples)}\n`)
    writeFileSync(resolve(outputDirectory, 'lesson-difficulties.json'), `${JSON.stringify(difficulties)}\n`)
    writeFileSync(resolve(outputDirectory, 'lesson-aliases.json'), `${JSON.stringify(aliases)}\n`)
  } else {
    for (const name of ['lesson-examples', 'lesson-difficulties', 'lesson-aliases']) {
      rmSync(resolve(outputDirectory, `${name}.json`), { force: true })
    }
  }
  writeFileSync(resolve(outputDirectory, 'engine-profile.json'), `${JSON.stringify({ profile, features, capabilities })}\n`)
  return { profile, capabilities, bytes: bytes.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildBrowserEngine(process.argv[2], process.argv[3])
}
