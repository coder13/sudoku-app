import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react'

type FadeProps = {
  'data-board-fade'?: 'enter' | 'exit'
  'aria-hidden'?: boolean
  inert?: boolean
}

export type BoardMark = ReactElement<FadeProps>

export function BoardMarks({ items, group }: { items: BoardMark[]; group?: ReactElement }) {
  const [previous, setPrevious] = useState(items)
  const [entering, setEntering] = useState<Set<BoardMark['key']>>(() => new Set())
  const [exiting, setExiting] = useState<BoardMark[]>([])
  const timers = useRef(new Map<BoardMark, number>())

  if (previous !== items) {
    const currentKeys = new Set(items.map(({ key }) => key))
    const previousKeys = new Set(previous.map(({ key }) => key))
    const removed = previous.filter(({ key }) => !currentKeys.has(key))
    const remaining = exiting.filter(({ key }) => !currentKeys.has(key))
    setPrevious(items)
    setEntering(new Set(items.filter(({ key }) => !previousKeys.has(key)).map(({ key }) => key)))
    if (removed.length || remaining.length !== exiting.length) setExiting([...remaining, ...removed])
  }

  useEffect(() => {
    if (!exiting.length && !timers.current.size) return
    for (const [item, timer] of timers.current) {
      if (exiting.includes(item)) continue
      window.clearTimeout(timer)
      timers.current.delete(item)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (exiting.length) setExiting([])
      return
    }
    for (const item of exiting) {
      if (timers.current.has(item)) continue
      // Leave a frame or two for the browser to start the 200 ms CSS transition.
      timers.current.set(item, window.setTimeout(() => {
        timers.current.delete(item)
        setExiting((current) => current.filter((mark) => mark !== item))
      }, 250))
    }
  }, [exiting])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const marks = [
    ...exiting.map((item) => cloneElement(item, { 'data-board-fade': 'exit', 'aria-hidden': true, inert: true })),
    ...items.map((item) => cloneElement(item, { 'data-board-fade': entering.has(item.key) ? 'enter' : undefined })),
  ]
  return group && marks.length ? cloneElement(group, undefined, marks) : marks
}
