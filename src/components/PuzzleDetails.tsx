import type { ReactNode } from 'react'

export type PuzzleDetail = { label: string; value: ReactNode }

/** Render named puzzle facts independently of the dialog, dock, or route that hosts them. */
export function PuzzleDetails({ items }: { items: readonly PuzzleDetail[] }) {
  return <section className="advanced-details" aria-label="Puzzle details">
    <dl>
      {items.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>
}
