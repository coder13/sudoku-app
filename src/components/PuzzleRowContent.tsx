import type { ReactNode } from 'react'
import { PuzzleThumbnail } from './PuzzleThumbnail'

/** Shared puzzle facts for rows whose native link or button behavior belongs to the caller. */
export function PuzzleRowContent({ values, size, title, detail, trailing }: {
  values: string
  size?: number
  title: string
  detail?: ReactNode
  trailing?: ReactNode
}) {
  return <>
    <PuzzleThumbnail values={values} size={size} />
    <span className="game-row-copy"><strong>{title}</strong>{detail != null && <small>{detail}</small>}</span>
    {trailing}
  </>
}
