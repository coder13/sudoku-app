import type { ReactNode } from 'react'

/** Keep the live puzzle and pause view in stable layers while making only one interactive. */
export function PlayStageLayers({ paused, live, pause }: { paused: boolean; live: ReactNode; pause: ReactNode }) {
  return (
    <div className="puzzle-play-layers" data-paused={paused || undefined}>
      <div className="puzzle-play-layer puzzle-live-layer" aria-hidden={paused || undefined} inert={paused}>
        {live}
      </div>
      <div className="puzzle-play-layer puzzle-pause-layer" aria-hidden={!paused || undefined} inert={!paused}>
        {pause}
      </div>
    </div>
  )
}
