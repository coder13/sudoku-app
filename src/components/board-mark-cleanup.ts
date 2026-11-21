type Cleanup = () => void

const deadlines = new Map<Cleanup, number>()
let timer: ReturnType<typeof setTimeout> | undefined
let nextDeadline = Infinity

function scheduleDeadline() {
  const next = Math.min(...deadlines.values())
  if (timer !== undefined && next >= nextDeadline && next !== Infinity) return
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  nextDeadline = next
  if (next === Infinity) return
  timer = setTimeout(() => {
    timer = undefined
    nextDeadline = Infinity
    const now = performance.now()
    const ready = [...deadlines].filter(([, deadline]) => deadline <= now)
    for (const [cleanup] of ready) deadlines.delete(cleanup)
    // React batches all expired groups from this one callback.
    for (const [cleanup] of ready) cleanup()
    scheduleDeadline()
  }, Math.max(0, next - performance.now()))
}

/** One fallback timer serves all board marks, with each group's own deadline. */
export function afterBoardFade(cleanup: Cleanup, deadline: number) {
  deadlines.set(cleanup, deadline)
  scheduleDeadline()
  return () => { deadlines.delete(cleanup); scheduleDeadline() }
}

const completions = new Set<Cleanup>()
let frame: number | undefined

/** Transition events from a dense board finish together in the next frame. */
export function finishBoardFade(cleanup: Cleanup) {
  completions.add(cleanup)
  frame ??= requestAnimationFrame(() => {
    frame = undefined
    const ready = [...completions]
    completions.clear()
    for (const complete of ready) complete()
  })
  return () => {
    completions.delete(cleanup)
    if (!completions.size && frame !== undefined) {
      cancelAnimationFrame(frame)
      frame = undefined
    }
  }
}
