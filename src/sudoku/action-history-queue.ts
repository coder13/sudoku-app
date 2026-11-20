import { matchActionBatch, pendingActionBatch, type ActionHistoryEntry, type ActionMatcher } from './action-history.ts'

type BatchMatcher = { match: ActionMatcher; close: () => void }

/** Finish a valid batch before starting another one from the latest history. */
export function createActionHistoryQueue(
  createMatcher: () => BatchMatcher,
  apply: (entries: readonly ActionHistoryEntry[], matches: readonly ActionHistoryEntry[]) => readonly ActionHistoryEntry[],
) {
  let history: readonly ActionHistoryEntry[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: { entries: readonly ActionHistoryEntry[]; matcher: BatchMatcher } | undefined
  let closed = false

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    clearTimer()
    if (closed || active) return
    const batch = pendingActionBatch(history, Date.now())
    if (!batch) return
    timer = setTimeout(() => {
      timer = undefined
      const next = pendingActionBatch(history, Date.now())
      if (!next) return
      if (next.delay > 0) { schedule(); return }
      const job = { entries: next.entries, matcher: createMatcher() }
      active = job
      void matchActionBatch(job.entries, job.matcher.match).then(matches => {
        if (closed || active !== job) return
        history = apply(job.entries, matches)
        active = undefined
        job.matcher.close()
        schedule()
      }, () => {
        if (active !== job) return
        active = undefined
        job.matcher.close()
      })
    }, batch.delay)
  }

  return {
    update(latest: readonly ActionHistoryEntry[]) {
      if (closed) return
      history = latest
      if (active) {
        const start = history.indexOf(active.entries[0])
        if (start >= 0 && active.entries.every((entry, index) => history[start + index] === entry)) return
        // Restarted, replaced or deleted history no longer needs the old proof.
        active.matcher.close()
        active = undefined
      }
      schedule()
    },
    close() {
      closed = true
      clearTimer()
      active?.matcher.close()
      active = undefined
    },
  }
}
