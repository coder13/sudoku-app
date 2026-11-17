import { execFileSync } from 'node:child_process'

// Avoid retaining a large incremental cache for each capability combination.
const env = { ...process.env, CARGO_INCREMENTAL: '0', CARGO_PROFILE_DEV_DEBUG: '0', CARGO_PROFILE_TEST_DEBUG: '0' }
const optional = ['variants', 'generation', 'teaching']
for (let mask = 0; mask < 1 << optional.length; mask++) {
  const selected = optional.filter((_, bit) => mask & 1 << bit)
  const nativeArgs = ['--locked', '-p', 'sudoku-app-engine', '--no-default-features']
  if (selected.length) nativeArgs.push('--features', selected.join(','))
  execFileSync('cargo', ['check', ...nativeArgs, '--all-targets'], { stdio: 'inherit', env })
  const features = ['wasm-api', ...selected]
  const args = ['--locked', '-p', 'sudoku-app-engine', '--no-default-features', '--features', features.join(',')]
  console.log(`Checking ${features.join(', ')}`)
  execFileSync('cargo', ['check', ...args, '--all-targets'], { stdio: 'inherit', env })
  execFileSync('cargo', ['test', ...args, '--test', 'build_contract'], { stdio: 'inherit', env })
  execFileSync('cargo', ['test', ...args, '--lib', 'capabilities_match_build_features'], { stdio: 'inherit', env })
}
