import { cloneElement, memo, useCallback, useEffect, useRef, useState, type ReactElement, type TransitionEvent } from 'react'
import { afterBoardFade, finishBoardFade } from './board-mark-cleanup'

const EXIT_CLEANUP_FALLBACK_MS = 250

type FadeProps = {
  'data-board-fade'?: 'enter' | 'exit'
  'aria-hidden'?: boolean
  inert?: boolean
  onTransitionEnd?: (event: TransitionEvent) => void
}

export type BoardMark = ReactElement<FadeProps>
type ExitingMark = { item: BoardMark }

// Stable items and group props skip unrelated board updates; fade state still updates normally.
export const BoardMarks = memo(function BoardMarks({ items, group }: { items: BoardMark[]; group?: ReactElement }) {
  const [previous, setPrevious] = useState(items)
  const [entering, setEntering] = useState<Set<BoardMark['key']>>(() => new Set())
  const [exiting, setExiting] = useState<ExitingMark[]>([])
  // Cached elements can leave, return, and leave again before a completion frame.
  // Each exit needs its own identity so an older completion cannot remove it.
  const deadlines = useRef(new Map<ExitingMark, number>())
  const finished = useRef(new Set<ExitingMark>())
  const cancelCompletion = useRef<(() => void) | undefined>(undefined)
  const removeFinished = useCallback(() => {
    cancelCompletion.current = undefined
    const removed = finished.current
    finished.current = new Set()
    setExiting(current => current.filter(mark => !removed.has(mark)))
  }, [])

  if (previous !== items) {
    const currentKeys = new Set(items.map(({ key }) => key))
    const previousKeys = new Set(previous.map(({ key }) => key))
    const removed = previous.filter(({ key }) => !currentKeys.has(key)).map(item => ({ item }))
    const remaining = exiting.filter(({ item }) => !currentKeys.has(item.key))
    setPrevious(items)
    setEntering(new Set(items.filter(({ key }) => !previousKeys.has(key)).map(({ key }) => key)))
    if (removed.length || remaining.length !== exiting.length) setExiting([...remaining, ...removed])
  }

  useEffect(() => {
    for (const item of deadlines.current.keys()) {
      if (exiting.includes(item)) continue
      deadlines.current.delete(item)
    }
    if (!exiting.length) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      deadlines.current.clear()
      setExiting([])
      return
    }
    const now = performance.now()
    for (const item of exiting) {
      if (!deadlines.current.has(item)) deadlines.current.set(item, now + EXIT_CLEANUP_FALLBACK_MS)
    }
    // Clean up even when the browser skips opacity transitions. New removals
    // keep their own deadlines rather than extending an older mark's lifetime.
    return afterBoardFade(() => {
      const now = performance.now()
      setExiting(current => current.filter(mark => (deadlines.current.get(mark) ?? Infinity) > now))
    }, Math.min(...deadlines.current.values()))
  }, [exiting])

  useEffect(() => () => { cancelCompletion.current?.() }, [])

  const marks = [
    ...exiting.map((mark) => cloneElement(mark.item, {
      'data-board-fade': 'exit',
      'aria-hidden': true,
      inert: true,
      onTransitionEnd: (event) => {
        if (event.target !== event.currentTarget || event.pseudoElement || event.propertyName !== 'opacity') return
        finished.current.add(mark)
        cancelCompletion.current ??= finishBoardFade(removeFinished)
      },
    })),
    ...items.map((item) => entering.has(item.key) ? cloneElement(item, { 'data-board-fade': 'enter' }) : item),
  ]
  return group && marks.length ? cloneElement(group, undefined, marks) : marks
})
