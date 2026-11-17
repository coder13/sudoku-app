import { runEngine, type LessonExample } from './engine.ts'
import { lessonValues } from './lesson-diagram.ts'
import { variantLessonExercise, type LessonExercise } from './lesson-examples.ts'

export type WorkedExample = Omit<LessonExample, 'practice'> & Pick<LessonExercise, 'variantPuzzle'>
type ExampleEntry = { example: WorkedExample }

const STORE = 'examples'
const memory = new Map<string, unknown>()
let database: Promise<IDBDatabase> | undefined

function openExamples() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sudoku-worked-examples', 1)
    request.onblocked = () => reject(new Error('Example storage is unavailable'))
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = undefined }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch(error => {
    database = undefined
    throw error
  })
  return database
}

async function readExample<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const db = await openExamples()
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  } catch { return undefined }
}

async function saveExample(key: string, value: unknown) {
  memory.set(key, value)
  try {
    const db = await openExamples()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore(STORE).put(value, key)
    })
    if (memory.get(key) === value) memory.delete(key)
  } catch { /* Keep the current session usable when browser storage is unavailable. */ }
}

export async function readWorkedExampleNumber(article: string, technique: string, authoredCount: number, variant: boolean) {
  const position = await readExample<number>(`${article}:${technique}:position`)
  if (position !== undefined) return position

  const legacy = await readExample<number>(`${technique}:selected`)
  if (!legacy) return 0
  // The old variant browser put the authored board second.
  if (variant && legacy === 2) return 0
  return authoredCount + (variant && legacy > 2 ? legacy - 2 : legacy - 1)
}

export function saveWorkedExampleNumber(article: string, technique: string, number: number) {
  return saveExample(`${article}:${technique}:position`, number)
}

export function workedExampleSeed(technique: string, number: number) {
  // Keep the seed and index mapping stable across devices and visits.
  let seed = 0x811c9dc5
  for (const character of technique) seed = Math.imul(seed ^ character.charCodeAt(0), 0x01000193)
  return (seed + Math.imul(number, 0x9e3779b9)) >>> 0
}

function forDisplay({ givens, entries, eliminations, candidates, deduction, pattern, variantPuzzle }: LessonExercise): WorkedExample {
  return { givens, entries, eliminations, candidates, deduction, pattern, variantPuzzle }
}

export async function generateLessonExercise(technique: string, seed: number, exclude: string, variant: boolean): Promise<LessonExercise> {
  const request = { type: 'generate-practice-example', technique, seed, exclude } as const
  return variant ? variantLessonExercise(await runEngine({ ...request, variant: true })) : runEngine(request)
}

export async function loadWorkedExample(technique: string, number: number, initial: WorkedExample): Promise<ExampleEntry> {
  // Keep the first two browsed variant boards in their original order.
  if (initial.variantPuzzle && number <= 2) {
    const key = `${technique}:variants`
    let examples = await readExample<WorkedExample[]>(key)
    if (!examples) {
      const exercises = await runEngine({ type: 'practice-examples', technique, variant: true }, { background: true })
      // The article and the practice board use the first two exercises.
      examples = [...exercises.slice(2), ...exercises.slice(0, 2)].map(exercise => forDisplay(variantLessonExercise(exercise)))
      await saveExample(key, examples)
    }
    const example = examples[number === 1 ? 0 : 2]
    if (!example) throw new Error('Example unavailable')
    return { example }
  }

  const key = `${technique}:example:${number}`
  const saved = await readExample<ExampleEntry>(key)
  if (saved) return saved
  const previous = initial.variantPuzzle && number === 3
    ? await loadWorkedExample(technique, 2, initial)
    : number > 1 ? await readExample<ExampleEntry>(`${technique}:example:${number - 1}`) : undefined
  const exercise = await generateLessonExercise(technique, workedExampleSeed(technique, number),
    lessonValues(previous?.example ?? initial), Boolean(initial.variantPuzzle))
  const entry = { example: forDisplay(exercise) }
  await saveExample(key, entry)
  return entry
}
