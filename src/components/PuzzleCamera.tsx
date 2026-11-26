import { Button } from './Button'
import { useState } from 'react'
import { imageCanvas } from '../sudoku/photo-image'
import { useCameraStream } from './useCameraStream'

export function PuzzleCamera({ onCapture, onCancel }: {
  onCapture: (photo: Blob) => void
  onCancel: () => void
}) {
  const { videoRef: video, active, ready, failed: cameraFailed } = useCameraStream({ width: 1920, height: 1080 })
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  function capture() {
    const frame = video.current
    if (!frame?.videoWidth || !frame.videoHeight) return
    setCapturing(true)
    try {
      const { canvas, context } = imageCanvas(frame.videoWidth, frame.videoHeight)
      context.drawImage(frame, 0, 0)
      canvas.toBlob(photo => {
        if (!active.current) return
        if (photo) onCapture(photo)
        else captureFailed()
      }, 'image/jpeg', 0.94)
    } catch {
      captureFailed()
    }
  }

  function captureFailed() {
    setCapturing(false)
    setError('The photo could not be captured. Try again or choose an image.')
  }

  return <section className="photo-import">
    <p>Hold the camera straight over the puzzle and fit the full grid in the frame.</p>
    <video ref={video} className="photo-camera" autoPlay muted playsInline
      aria-label="Camera preview" />
    {(error || cameraFailed) && <p className="form-error" role="alert">{error || 'The camera could not open. Check camera permissions or choose an image.'}</p>}
    {!ready && !error && !cameraFailed && <p role="status">Opening camera…</p>}
    <div className="dialog-actions">
      <Button type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" variant="primary" onClick={capture}
        disabled={!ready || capturing}>{capturing ? 'Capturing…' : 'Capture photo'}</Button>
    </div>
  </section>
}
