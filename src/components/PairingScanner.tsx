import { Button, buttonClassName } from './Button'
import { useCallback, useEffect, useRef, useState } from 'react'
import type jsQR from 'jsqr'
import { createPairingScanTracker, PRODUCTION_SYNC_ORIGIN, readPairingLink } from '../sudoku/pairing-link'

const hostedScanner = PRODUCTION_SYNC_ORIGIN + '/sync/scan'

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

export function PairingScanner({ pairingOrigin, onTicket }: {
  pairingOrigin: string
  onTicket: (ticket: string) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const scanVersion = useRef(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [error, setError] = useState('')
  const [otherOrigin, setOtherOrigin] = useState<string | null>(null)
  const checkCode = useCallback((text: string) => {
    const link = readPairingLink(text)
    const mismatch = link && link.origin !== pairingOrigin ? link.origin : null
    setOtherOrigin(mismatch)
    setError(link ? '' : 'Use the QR code from Device sync on your other device.')
    return mismatch ? null : link?.ticket ?? null
  }, [pairingOrigin])

  useEffect(() => {
    const element = video.current!
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const observe = createPairingScanTracker()
    const resetScan = () => observe(null, performance.now())
    document.addEventListener('visibilitychange', resetScan)
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
            let ticket = null
            if (!document.hidden && element.readyState >= 2 && element.videoWidth) {
              const text = readCode(element, element.videoWidth, element.videoHeight, decode, 800)
              if (text) ticket = checkCode(text)
            }
            const confirmed = observe(ticket, performance.now())
            if (confirmed) { stop(); onTicket(confirmed); return }
            timer = setTimeout(scan, ticket ? 100 : 220)
          } catch { stop(); setCameraError('Camera scan unavailable. Choose a QR photo.') }
        }
        scan()
      } catch {
        stop()
        if (!closed) setCameraError('Camera unavailable. Allow camera access or choose a QR photo.')
      }
    }
    void start()
    return () => {
      closed = true
      scanVersion.current++
      document.removeEventListener('visibilitychange', resetScan)
      stop()
    }
  }, [checkCode, onTicket])

  async function scanPhoto(photo: File) {
    const version = ++scanVersion.current
    setError('')
    setOtherOrigin(null)
    if (photo.size > 20 * 1024 * 1024) { setError('Choose a QR photo under 20 MB.'); return }
    const url = URL.createObjectURL(photo)
    try {
      const image = new Image()
      image.src = url
      const [, { default: decode }] = await Promise.all([image.decode(), import('jsqr')])
      if (version !== scanVersion.current) return
      const text = readCode(image, image.naturalWidth, image.naturalHeight, decode, 1600)
      if (!text) {
        setError('No QR code found. Try a closer photo with the whole code in view.')
        return
      }
      const ticket = checkCode(text)
      if (ticket) onTicket(ticket)
    } catch {
      if (version === scanVersion.current) setError('Couldn’t read that photo. Try a screenshot or another image.')
    } finally { URL.revokeObjectURL(url) }
  }
  return <section className="sync-scanner">
    <p>On your linked device, open Device sync and choose <strong>Link another device</strong>.</p>
    <video ref={video} className="sync-camera" hidden={Boolean(cameraError)} muted playsInline autoPlay aria-label="QR scanner camera" />
    {cameraError ? <p role="status">{cameraError}</p> : !cameraReady && <p role="status">Opening camera…</p>}
    {error && <p role="alert">{error}</p>}
    {otherOrigin && <p className="sync-scan-origin" role="alert">This code is for{' '}
      <strong>{otherOrigin === PRODUCTION_SYNC_ORIGIN ? 'klyn-sudoku.pages.dev' : otherOrigin}</strong>.
      {otherOrigin !== PRODUCTION_SYNC_ORIGIN && ' Open Device sync at that address and scan again.'}
    </p>}
    {otherOrigin === PRODUCTION_SYNC_ORIGIN && <a className={buttonClassName('primary')} href={hostedScanner}>Scan on klyn-sudoku.pages.dev</a>}
    <input ref={file} type="file" accept="image/*" hidden aria-label="QR photo" onChange={event => {
      const photo = event.target.files?.[0]
      event.target.value = ''
      if (photo) void scanPhoto(photo)
    }} />
    <Button onClick={() => file.current?.click()}>Choose QR photo</Button>
  </section>
}
