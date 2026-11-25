import { useCallback, useEffect, useRef, useState } from 'react'

type Options = {
  facingMode?: string
  width?: number
  height?: number
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop())
}

/** Own camera acquisition, video playback, cancellation, and track cleanup. */
export function useCameraStream({ facingMode = 'environment', width, height }: Options = {}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const active = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const stop = useCallback(() => {
    active.current = false
    const stream = streamRef.current
    streamRef.current = null
    stopTracks(stream)
    if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null
    setReady(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    const video = videoRef.current
    active.current = true
    setReady(false)
    setFailed(false)

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            ...(width ? { width: { ideal: width } } : {}),
            ...(height ? { height: { ideal: height } } : {}),
          },
        })
        if (cancelled || !active.current || !video) {
          stopTracks(stream)
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play()
        if (!cancelled && active.current) setReady(true)
      } catch {
        stopTracks(stream)
        if (!cancelled) {
          active.current = false
          setFailed(true)
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      active.current = false
      stopTracks(stream)
      if (streamRef.current === stream) streamRef.current = null
      if (video?.srcObject === stream) video.srcObject = null
    }
  }, [facingMode, height, width])

  return { videoRef, active, ready, failed, stop }
}
