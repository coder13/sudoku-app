import type { CSSProperties } from 'react'

/** Small grid summary shared by puzzle links, buttons, and library rows. */
export function PuzzleThumbnail({ values, size = 9 }: { values: string; size?: number }) {
  return <span className="mini-grid" data-size={size} style={{ '--mini-grid-size': size } as CSSProperties} aria-hidden="true">
    {[...values].map((digit, index) => <i key={index} data-filled={digit !== '0'} />)}
  </span>
}
