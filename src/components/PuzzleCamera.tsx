import { Button } from './Button'
import { useEffect, useRef, useState } from 'react'
import { imageCanvas } from '../sudoku/photo-image'

export function PuzzleCamera({ onCapture, onCancel }: {
  onCapture: (photo: Blob) => void
  onCancel: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const active = useRef(false)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let closed = false
    let stream: MediaStream | undefined
    active.current = true
    const element = video.current
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 },
        } })
        if (closed || !element) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        element.srcObject = stream
        await element.play()
      } catch {
        stream?.getTracks().forEach(track => track.stop())
        if (!closed) setError('The camera could not open. Check camera permissions or choose an image.')
      }
    }
    void start()
    return () => {
      closed = true
      active.current = false
      stream?.getTracks().forEach(track => track.stop())
      if (element) element.srcObject = null
    }
  }, [])

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
    <video ref={video} className="photo-camera" autoPlay muted playsInline onCanPlay={() => setReady(true)}
      aria-label="Camera preview" />
    {error && <p className="form-error" role="alert">{error}</p>}
    {!ready && !error && <p role="status">Opening camera…</p>}
    <div className="dialog-actions">
      <Button type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" variant="primary" onClick={capture}
        disabled={!ready || capturing}>{capturing ? 'Capturing…' : 'Capture photo'}</Button>
    </div>
  </section>
}
