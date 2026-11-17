// A small checksum detects stale or damaged puzzle data. It is not an auth token.
export function collectionGridHash(givens: string) {
  let hash = 2166136261
  for (let index = 0; index < givens.length; index++) hash = Math.imul(hash ^ givens.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
