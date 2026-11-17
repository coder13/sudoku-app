// Build capabilities omit code. Solver profiles choose techniques at runtime.
export const engineBuildProfiles = Object.freeze({
  solver: ['wasm-api'],
  'variant-solver': ['wasm-api', 'variants'],
  classic: ['wasm-api', 'generation', 'teaching'],
  app: ['wasm-api', 'variants', 'generation', 'teaching'],
})

export const appEngineProfile = 'app'

export function featuresForProfile(profile) {
  const features = engineBuildProfiles[profile]
  if (!Object.hasOwn(engineBuildProfiles, profile)) {
    throw new Error(`Choose an engine build profile: ${Object.keys(engineBuildProfiles).join(', ')}.`)
  }
  return [...features]
}
