import { runEngine, type LessonExample } from './engine.ts'
import { lessonValues } from './lesson-diagram.ts'
import { variantLessonExercise, type LessonExercise } from './lesson-examples.ts'

export type WorkedExample = Omit<LessonExample, 'practice'> & Pick<LessonExercise, 'variantPuzzle'>
type ExampleEntry = { example: WorkedExample; last?: number }

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

export function readWorkedExampleNumber(technique: string) {
  return readExample<number>(`${technique}:selected`)
}

export function saveWorkedExampleNumber(technique: string, number: number) {
  return saveExample(`${technique}:selected`, number)
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

export async function loadWorkedExample(technique: string, number: number, initial: WorkedExample): Promise<ExampleEntry> {
  if (initial.variantPuzzle) {
    const key = `${technique}:variants`
    let examples = await readExample<WorkedExample[]>(key)
    if (!examples) {
      const exercises = await runEngine({ type: 'practice-examples', technique, variant: true }, { background: true })
      // The article and the practice board use the first two exercises.
      examples = [...exercises.slice(2), ...exercises.slice(0, 2)].map(exercise => forDisplay(variantLessonExercise(exercise)))
      await saveExample(key, examples)
    }
    if (!examples[number - 1]) throw new Error('Example unavailable')
    return { example: examples[number - 1], last: examples.length }
  }

  const key = `${technique}:example:${number}`
  const saved = await readExample<ExampleEntry>(key)
  if (saved) return saved
  const previous = number > 1 ? await readExample<ExampleEntry>(`${technique}:example:${number - 1}`) : undefined
  const exercise = await runEngine({ type: 'generate-practice-example', technique,
    seed: workedExampleSeed(technique, number), exclude: lessonValues(previous?.example ?? initial) })
  const entry = { example: forDisplay(exercise) }
  await saveExample(key, entry)
  return entry
}
