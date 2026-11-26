import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type CellReference = { cell: number; digit?: number } | { cells: readonly number[] }
export type SetReference = { label: string; cells: readonly number[] }
export const SetReferenceContext = createContext<readonly SetReference[] | undefined>(undefined)
type ReferenceHighlightContextValue = {
  highlight: CellReference | null
  setHighlight: (reference: CellReference | null) => void
  clearHighlight: (reference: CellReference) => void
}

const CellReferenceHighlightContext = createContext<ReferenceHighlightContextValue | null>(null)

export function CellReferenceHighlightProvider({ children }: { children: ReactNode }) {
  const [highlight, setHighlight] = useState<CellReference | null>(null)
  const clearHighlight = useCallback((reference: CellReference) => {
    setHighlight(current => current === reference ? null : current)
  }, [])
  const value = useMemo(() => ({ highlight, setHighlight, clearHighlight }), [highlight, clearHighlight])
  return <CellReferenceHighlightContext.Provider value={value}>{children}</CellReferenceHighlightContext.Provider>
}

export function useCellReferenceHighlight() {
  return useContext(CellReferenceHighlightContext)
}

const COORDINATE = /(?:(?<digit>[1-9]\d?)\s*)?r(?<row>[1-9]\d?)c(?<column>[1-9]\d?)/
const SET_PAIR = /sets (?<firstSet>[1-9]\d*) and (?<secondSet>[1-9]\d*)/

export function CellReferenceText({ text, gridSize = 9 }: { text: string; gridSize?: number }) {
  const context = useCellReferenceHighlight()
  const setReferences = useContext(SetReferenceContext)
  const active = useRef<CellReference | null>(null)
  const clearHighlight = context?.clearHighlight
  const parts = useMemo(() => {
    const sets = new Map(setReferences?.map(set => [set.label.toLowerCase(), set.cells]))
    const names = [...sets.keys()].sort((a, b) => b.length - a.length)
      .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const alternatives = sets.size ? [COORDINATE.source, SET_PAIR.source, ...names] : [COORDINATE.source]
    const references = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
    const result: ({ text: string; reference?: CellReference; label?: string })[] = []
    let end = 0
    for (const match of text.matchAll(references)) {
      const start = match.index ?? 0
      if (start > end) result.push({ text: text.slice(end, start) })
      const notation = match[0]
      end = start + notation.length
      if (!match.groups?.row) {
        const { firstSet, secondSet } = match.groups ?? {}
        const first = sets.get(`set ${firstSet}`)
        const second = sets.get(`set ${secondSet}`)
        const cells = first && second ? [...new Set([...first, ...second])] : sets.get(notation.toLowerCase())
        result.push(cells?.length ? { text: notation, reference: { cells }, label: `Highlight ${notation}` } : { text: notation })
        continue
      }
      const row = Number(match.groups?.row)
      const column = Number(match.groups?.column)
      const digit = match.groups?.digit ? Number(match.groups.digit) : undefined
      const cell = (row - 1) * gridSize + column - 1
      result.push(row <= gridSize && column <= gridSize && (digit === undefined || digit <= gridSize)
        ? { text: notation, reference: { cell, digit }, label: `Highlight ${digit ? `${digit} in ` : ''}row ${row}, column ${column}` }
        : { text: notation })
    }
    if (end < text.length) result.push({ text: text.slice(end) })
    return result
  }, [text, gridSize, setReferences])
  useEffect(() => () => {
    if (active.current) clearHighlight?.(active.current)
    active.current = null
  }, [parts, clearHighlight])

  if (!context || !parts.some(part => part.reference)) return <>{text}</>
  function highlight(reference: CellReference) {
    active.current = reference
    context?.setHighlight(reference)
  }
  function clear(reference: CellReference) {
    if (active.current === reference) active.current = null
    clearHighlight?.(reference)
  }
  return <>{parts.map((part, index) => part.reference ? <span key={`${index}-${part.text}`} className="cell-reference-token" tabIndex={0}
    aria-label={part.label} onPointerEnter={event => { if (event.pointerType !== 'touch') highlight(part.reference!) }}
    onPointerLeave={() => clear(part.reference!)} onFocus={() => highlight(part.reference!)}
    onBlur={() => clear(part.reference!)}>{part.text}</span> : part.text)}</>
}
