export type CollectionReference = { collectionId: string; puzzleId: string }

export function isCollectionReference(value: unknown): value is CollectionReference {
  if (!value || typeof value !== 'object') return false
  const ref = value as CollectionReference
  return typeof ref.collectionId === 'string' && /^[a-z0-9-]{1,64}$/.test(ref.collectionId) &&
    typeof ref.puzzleId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(ref.puzzleId)
}
