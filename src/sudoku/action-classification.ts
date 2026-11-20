import { createEngineSession, runEngine, type DeductionAction, type EngineRequest, type EngineResult, type EngineRunOptions, type EngineRunner, type EngineSession } from './engine.ts'
import type { ActionMatcher } from './action-history.ts'
import { withHintPreferences } from './hint-preferences.ts'
import { withSolverProfile } from './solver-profile.ts'
import { techniqueActionKey } from './technique-progress.ts'
import { getVariantPlayOrder } from './variant-play.ts'
import type { VariantGame } from './variants.ts'

const MAX_CACHED_REQUESTS = 32
type Subscriber = { resolve: (value: unknown) => void; reject: (error: Error) => void }
type Classification = { key: string; request: EngineRequest; subscribers: Set<Subscriber>; session?: EngineSession }
const requests = new Map<string, Classification>()
const cached = new Map<string, unknown>()
let active: Classification | undefined
let idleSession: EngineSession | undefined

const cancelled = () => new DOMException('Action classification cancelled.', 'AbortError')

function requestKey(request: EngineRequest) {
  return JSON.stringify(request, (_, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)
}

function startNext() {
  if (active) return
  const job = requests.values().next().value
  if (!job) return
  active = job
  // The key captures preferences at enqueue time. Do not read them again later.
  job.session = idleSession ?? createEngineSession({ prepared: true })
  idleSession = undefined
  void job.session.run(job.request).then(value => finish(job, value), error => finish(job, undefined, error))
}

function finish(job: Classification, value: unknown, error?: Error) {
  if (requests.get(job.key) === job) requests.delete(job.key)
  if (active === job) active = undefined
  if (!error && job.subscribers.size) {
    cached.delete(job.key)
    cached.set(job.key, value)
    if (cached.size > MAX_CACHED_REQUESTS) cached.delete(cached.keys().next().value!)
    idleSession = job.session
  } else job.session?.close()
  for (const subscriber of [...job.subscribers]) {
    if (error) subscriber.reject(error)
    else subscriber.resolve(value)
  }
  startNext()
}

/** Share stateless history work; closing one scope cannot cancel another reader. */
export function createClassificationScope() {
  let closed = false
  const releases = new Set<() => void>()
  function run<T extends EngineRequest>(request: T, options: EngineRunOptions = {}): Promise<EngineResult<T>> {
    if (closed || options.signal?.aborted) return Promise.reject(cancelled())
    const prepared = withHintPreferences(withSolverProfile(request))
    const key = requestKey(prepared)
    if (cached.has(key)) {
      const value = cached.get(key)
      cached.delete(key)
      cached.set(key, value)
      return Promise.resolve(value as EngineResult<T>)
    }
    let job = requests.get(key)
    if (!job) {
      job = { key, request: prepared, subscribers: new Set() }
      requests.set(key, job)
    }
    const owned = job
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        settled = true
        releases.delete(release)
        options.signal?.removeEventListener('abort', release)
        owned.subscribers.delete(subscriber)
      }
      const release = () => {
        if (settled) return
        cleanup()
        reject(cancelled())
        if (!owned.subscribers.size) {
          if (requests.get(key) === owned) requests.delete(key)
          owned.session?.close()
        }
      }
      const subscriber: Subscriber = {
        resolve(value) { if (!settled) { cleanup(); resolve(value as EngineResult<T>) } },
        reject(error) { if (!settled) { cleanup(); reject(error) } },
      }
      owned.subscribers.add(subscriber)
      releases.add(release)
      options.signal?.addEventListener('abort', release, { once: true })
      startNext()
    })
  }
  return {
    run,
    close() {
      closed = true
      for (const release of [...releases]) release()
    },
  }
}

type ActionPosition = Parameters<ActionMatcher>[0]

export async function variantActionProofs(position: ActionPosition, variant: VariantGame, run: EngineRunner = runEngine) {
  return run({
    type: 'variant', operation: 'hints',
    position: { puzzle: variant.puzzle, entries: position.values, eliminations: position.eliminations },
    techniqueOrder: await getVariantPlayOrder(), limit: 64,
  }, { background: true })
}

export async function classifyActionTechniques(position: ActionPosition, actions: readonly DeductionAction[], variant?: VariantGame, run: EngineRunner = runEngine) {
  if (!variant) return run({ type: 'classify-actions', ...position, actions })
  const hints = await variantActionProofs(position, variant, run)
  const byAction = new Map<string, string>()
  for (const hint of hints) {
    for (const action of hint.actions) {
      const key = techniqueActionKey(action)
      if (!byAction.has(key)) byAction.set(key, hint.technique)
    }
  }
  return actions.map(action => byAction.get(techniqueActionKey(action)) ?? null)
}
