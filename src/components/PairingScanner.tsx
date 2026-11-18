import { Button } from './Button'
import { useEffect, useRef, useState } from 'react'
import type jsQR from 'jsqr'
import { pairingTicket } from '../sudoku/pairing-link'

function readCode(source: CanvasImageSource, width: number, height: number, decode: typeof jsQR, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Image processing unavailable')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return decode(image.data, image.width, image.height)?.data
}

export function PairingScanner({ onTicket }: { onTicket: (ticket: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const scanVersion = useRef(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const element = video.current!
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false
    function stop() {
      clearTimeout(timer)
      stream?.getTracks().forEach(track => track.stop())
      element.srcObject = null
    }
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
        if (closed) { stop(); return }
        element.srcObject = stream
        await element.play()
        const { default: decode } = await import('jsqr')
        if (closed) return
        setCameraReady(true)
        function scan() {
          if (closed) return
          try {
            if (!document.hidden && element.readyState >= 2 && element.videoWidth) {
              const text = readCode(element, element.videoWidth, element.videoHeight, decode, 800)
              if (text) {
                const ticket = pairingTicket(text, location.origin)
                if (ticket) { stop(); onTicket(ticket); return }
                setError('Use the code from Device sync on your other device.')
              }
            }
            timer = setTimeout(scan, 220)
          } catch { stop(); setCameraError('Camera scan unavailable. Choose a QR photo.') }
        }
        scan()
      } catch {
        stop()
        if (!closed) setCameraError('Camera unavailable. Allow camera access or choose a QR photo.')
      }
    }
    void start()
    return () => { closed = true; scanVersion.current++; stop() }
  }, [onTicket])

  async function scanPhoto(photo: File) {
    const version = ++scanVersion.current
    setError('')
    if (photo.size > 20 * 1024 * 1024) { setError('Choose a QR photo under 20 MB.'); return }
    const url = URL.createObjectURL(photo)
    try {
      const image = new Image()
      image.src = url
      const [, { default: decode }] = await Promise.all([image.decode(), import('jsqr')])
      if (version !== scanVersion.current) return
      const text = readCode(image, image.naturalWidth, image.naturalHeight, decode, 1600)
      const ticket = text && pairingTicket(text, location.origin)
      if (ticket) onTicket(ticket)
      else setError(text ? 'Use the code from Device sync on your other device.' : 'No QR code found. Try a closer photo with the whole code in view.')
    } catch {
      if (version === scanVersion.current) setError('Couldn’t read that photo. Try a screenshot or another image.')
    } finally { URL.revokeObjectURL(url) }
  }
  return <section className="sync-scanner">
    <p>On your linked device, open Device sync and choose <strong>Link another device</strong>.</p>
    <video ref={video} className="sync-camera" hidden={Boolean(cameraError)} muted playsInline autoPlay aria-label="QR scanner camera" />
    {cameraError ? <p role="status">{cameraError}</p> : !cameraReady && <p role="status">Opening camera…</p>}
    {error && <p role="alert">{error}</p>}
    <input ref={file} type="file" accept="image/*" hidden aria-label="QR photo" onChange={event => {
      const photo = event.target.files?.[0]
      event.target.value = ''
      if (photo) void scanPhoto(photo)
    }} />
    <Button onClick={() => file.current?.click()}>Choose QR photo</Button>
  </section>
}
