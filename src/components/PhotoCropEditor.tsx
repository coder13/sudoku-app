import { type KeyboardEvent, type PointerEvent, useId, useRef } from 'react'
import { adjustPhotoCrop, projectPhotoCrop, type CropHandle, type PhotoCrop } from '../sudoku/photo-crop'

const CORNERS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

export function PhotoCropEditor({ url, width, height, crop, onChange }: {
  url: string; width: number; height: number; crop: PhotoCrop; onChange: (crop: PhotoCrop) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; handle: CropHandle; crop: PhotoCrop; x: number; y: number; bounds: DOMRect }>(null)
  const help = useId()
  const points = crop.map(({ x, y }) => `${x},${y}`).join(' ')
  const percentage = ({ x, y }: PhotoCrop[number]) => `${x / width * 100}% ${y / height * 100}%`
  const project = projectPhotoCrop(crop)
  const guides = [1 / 3, 2 / 3].flatMap(step => [
    [project(step, 0), project(step, 1)], [project(0, step), project(1, step)],
  ])

  function handleEvents(handle: CropHandle) {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current || !event.isPrimary || event.button !== 0 || !surface.current) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointer: event.pointerId, handle, crop, x: event.clientX, y: event.clientY,
          bounds: surface.current.getBoundingClientRect(),
        }
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const start = drag.current
        if (!start || start.pointer !== event.pointerId) return
        const next = adjustPhotoCrop(start.crop, start.handle,
          (event.clientX - start.x) * width / start.bounds.width,
          (event.clientY - start.y) * height / start.bounds.height, width, height)
        if (next) onChange(next)
      },
      onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current?.pointer === event.pointerId) drag.current = null
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const direction = ARROWS[event.key]
        if (!direction) return
        event.preventDefault()
        const step = event.shiftKey ? 12 : 2
        const next = adjustPhotoCrop(crop, handle, direction[0] * step, direction[1] * step, width, height)
        if (next) onChange(next)
      },
    }
  }

  return <div className="photo-crop-image" ref={surface} role="group" aria-label="Grid crop">
    <img src={url} width={width} height={height} alt="Selected puzzle image" draggable={false} />
    <span className="sr-only" id={help}>Use the arrow keys. Hold Shift for larger steps.</span>
    <svg className="photo-crop-guides" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`M0 0H${width}V${height}H0Z M${points}Z`} fillRule="evenodd" className="photo-crop-mask" />
      {guides.map(([start, end], index) => <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
        className="photo-crop-guide" vectorEffect="non-scaling-stroke" />)}
      <polygon points={points} className="photo-crop-outline" vectorEffect="non-scaling-stroke" />
    </svg>
    <button type="button" className="photo-crop-move" aria-label="Move crop" aria-describedby={help}
      style={{ clipPath: `polygon(${crop.map(percentage).join(', ')})` }} {...handleEvents('move')} />
    {([0, 1, 2, 3] as const).map(index => (
      <button key={index} type="button" className="photo-crop-handle" aria-label={`${CORNERS[index]} crop corner`}
        aria-describedby={help} style={{ left: `${crop[index].x / width * 100}%`, top: `${crop[index].y / height * 100}%` }}
        {...handleEvents(index)} />
    ))}
  </div>
}
