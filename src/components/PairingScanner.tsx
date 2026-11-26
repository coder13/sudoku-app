import { Button, buttonClassName } from './Button'
import { useCallback, useEffect, useRef, useState } from 'react'
import type jsQR from 'jsqr'
import { deviceSyncPath } from '../sudoku/sync-steps'
import { createPairingScanTracker, isProductionSyncOrigin, readPairingLink, sharesPairingService } from '../sudoku/pairing-link'
import { useCameraStream } from './useCameraStream'

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
  const { videoRef: video, ready: cameraReady, failed: cameraFailed, active, stop: stopCamera } = useCameraStream()
  const file = useRef<HTMLInputElement>(null)
  const scanVersion = useRef(0)
  const [scanUnavailable, setScanUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [otherOrigin, setOtherOrigin] = useState<string | null>(null)
  const matchingScanner = otherOrigin && isProductionSyncOrigin(otherOrigin) ? new URL(deviceSyncPath + '/scan', otherOrigin) : null
  const checkCode = useCallback((text: string) => {
    const link = readPairingLink(text)
    const mismatch = link && !sharesPairingService(link.origin, pairingOrigin) ? link.origin : null
    setOtherOrigin(mismatch)
    setError(link ? '' : 'Use the QR code from Device sync on your other device.')
    return mismatch ? null : link?.ticket ?? null
  }, [pairingOrigin])

  useEffect(() => {
    if (!cameraReady) return
    const element = video.current
    if (!element) return
    const scanVideo = element as HTMLVideoElement
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const observe = createPairingScanTracker()
    const resetScan = () => observe(null, performance.now())
    document.addEventListener('visibilitychange', resetScan)
    async function start() {
      try {
        const { default: decode } = await import('jsqr')
        if (closed || !active.current) return
        function scan() {
          if (closed || !active.current) return
          try {
            let ticket = null
            if (!document.hidden && scanVideo.readyState >= 2 && scanVideo.videoWidth) {
              const text = readCode(scanVideo, scanVideo.videoWidth, scanVideo.videoHeight, decode, 800)
              if (text) ticket = checkCode(text)
            }
            const confirmed = observe(ticket, performance.now())
            if (confirmed) { stopCamera(); onTicket(confirmed); return }
            timer = setTimeout(scan, ticket ? 100 : 220)
          } catch { stopCamera(); setScanUnavailable(true) }
        }
        scan()
      } catch {
        if (!closed) { stopCamera(); setScanUnavailable(true) }
      }
    }
    void start()
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', resetScan)
      clearTimeout(timer)
    }
  }, [cameraReady, active, checkCode, onTicket, stopCamera])

  useEffect(() => () => { scanVersion.current++ }, [])

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
    <video ref={video} className="sync-camera" hidden={cameraFailed || scanUnavailable} muted playsInline autoPlay aria-label="QR scanner camera" />
    {cameraFailed || scanUnavailable ? <p role="status">{scanUnavailable ? 'Camera scan unavailable. Choose a QR photo.' : 'Camera unavailable. Allow camera access or choose a QR photo.'}</p> : !cameraReady && <p role="status">Opening camera…</p>}
    {error && <p role="alert">{error}</p>}
    {otherOrigin && <p className="sync-scan-origin" role="alert">This code is for{' '}
      <strong>{matchingScanner?.host ?? otherOrigin}</strong>.
      {!matchingScanner && ' Open Device sync at that address and scan again.'}
    </p>}
    {matchingScanner && <a className={buttonClassName('primary')} href={matchingScanner.href}>Scan on {matchingScanner.host}</a>}
    <input ref={file} type="file" accept="image/*" hidden aria-label="QR photo" onChange={event => {
      const photo = event.target.files?.[0]
      event.target.value = ''
      if (photo) void scanPhoto(photo)
    }} />
    <Button onClick={() => file.current?.click()}>Choose QR photo</Button>
  </section>
}
