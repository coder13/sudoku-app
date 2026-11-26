import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type CellReference = { cell: number; digit?: number }
type ReferenceHighlightContextValue = {
  highlight: CellReference | null
  setHighlight: (reference: CellReference | null) => void
}

const CellReferenceHighlightContext = createContext<ReferenceHighlightContextValue | null>(null)

export function CellReferenceHighlightProvider({ children }: { children: ReactNode }) {
  const [highlight, setHighlight] = useState<CellReference | null>(null)
  const value = useMemo(() => ({ highlight, setHighlight }), [highlight])
  return <CellReferenceHighlightContext.Provider value={value}>{children}</CellReferenceHighlightContext.Provider>
}

export function useCellReferenceHighlight() {
  return useContext(CellReferenceHighlightContext)
}

const REFERENCE = /(?<![\p{L}\p{N}])(?:(?<digit>[1-9])\s*)?[rR](?<row>[1-9])[cC](?<column>[1-9])(?![\p{L}\p{N}])/gu

export function CellReferenceText({ text }: { text: string }) {
  const context = useCellReferenceHighlight()
  const parts = useMemo(() => {
    const result: ({ text: string; reference?: CellReference; label?: string })[] = []
    let end = 0
    for (const match of text.matchAll(REFERENCE)) {
      const start = match.index ?? 0
      if (start > end) result.push({ text: text.slice(end, start) })
      const row = Number(match.groups?.row)
      const column = Number(match.groups?.column)
      const digit = match.groups?.digit ? Number(match.groups.digit) : undefined
      const cell = (row - 1) * 9 + column - 1
      const notation = match[0]
      result.push({ text: notation, reference: { cell, digit }, label: `Highlight ${digit ? `${digit} in ` : ''}row ${row}, column ${column}` })
      end = start + notation.length
    }
    if (end < text.length) result.push({ text: text.slice(end) })
    return result
  }, [text])

  if (!context || !parts.some(part => part.reference)) return <>{text}</>
  return <>{parts.map((part, index) => part.reference ? <span key={`${index}-${part.text}`} className="cell-reference-token" tabIndex={0}
    aria-label={part.label} onPointerEnter={event => { if (event.pointerType !== 'touch') context.setHighlight(part.reference!) }}
    onPointerLeave={() => context.setHighlight(null)} onFocus={() => context.setHighlight(part.reference!)}
    onBlur={() => context.setHighlight(null)}>{part.text}</span> : part.text)}</>
}
