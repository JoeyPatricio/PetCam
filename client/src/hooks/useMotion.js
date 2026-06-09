import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useMotion
 * Frame-by-frame pixel difference motion detection using an offscreen canvas.
 *
 * Props:
 *   videoRef         - ref to the live <video> element
 *   isActive         - whether the camera is running
 *   sensitivity      - 0–100 (higher = more sensitive, default 30)
 *   onMotion         - callback(event) fired when motion is detected
 *
 * Returns:
 *   motionLevel      - 0–100 current motion intensity
 *   isMotion         - boolean
 *   motionEnabled    - whether detection is running
 *   toggleMotion     - fn() to enable/disable detection
 *   overlayCanvasRef - attach to a <canvas> overlay for visual diff
 */
export function useMotion({ videoRef, isActive, sensitivity = 30, onMotion }) {
  const [motionLevel,   setMotionLevel]   = useState(0)
  const [isMotion,      setIsMotion]      = useState(false)
  const [motionEnabled, setMotionEnabled] = useState(true)

  const overlayCanvasRef  = useRef(null)
  const prevFrameRef      = useRef(null)
  const rafRef            = useRef(null)
  const motionCooldownRef = useRef(false)

  const getThreshold = (s) => Math.max(1, 15 - Math.floor(s / 7))

  const analyze = useCallback(() => {
    const video  = videoRef.current
    const canvas = overlayCanvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(analyze)
      return
    }

    const { videoWidth: w, videoHeight: h } = video
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(analyze)
      return
    }

    // Work at 1/4 resolution for performance
    const sw = Math.floor(w / 4)
    const sh = Math.floor(h / 4)

    const offscreen = document.createElement('canvas')
    offscreen.width  = sw
    offscreen.height = sh
    const ctx = offscreen.getContext('2d')
    ctx.drawImage(video, 0, 0, sw, sh)
    const current = ctx.getImageData(0, 0, sw, sh)

    if (prevFrameRef.current && motionEnabled) {
      const prev  = prevFrameRef.current.data
      const curr  = current.data
      const total = sw * sh

      let changedPixels = 0
      const PIXEL_DIFF_THRESHOLD = 25

      const overlayCtx = canvas.getContext('2d')
      canvas.width  = w
      canvas.height = h
      overlayCtx.clearRect(0, 0, w, h)

      for (let i = 0; i < total; i++) {
        const idx = i * 4
        const dr  = Math.abs(curr[idx]     - prev[idx])
        const dg  = Math.abs(curr[idx + 1] - prev[idx + 1])
        const db  = Math.abs(curr[idx + 2] - prev[idx + 2])

        if (dr + dg + db > PIXEL_DIFF_THRESHOLD * 3) {
          changedPixels++
          const px = (i % sw) * 4
          const py = Math.floor(i / sw) * 4
          overlayCtx.fillStyle = 'rgba(200, 169, 110, 0.25)'
          overlayCtx.fillRect(px, py, 4, 4)
        }
      }

      const level     = Math.min(100, Math.round((changedPixels / total) * 100 * 10))
      const threshold = getThreshold(sensitivity)
      const detected  = level > threshold

      setMotionLevel(level)
      setIsMotion(detected)

      if (detected && !motionCooldownRef.current) {
        motionCooldownRef.current = true
        onMotion?.({ level, timestamp: new Date() })
        setTimeout(() => { motionCooldownRef.current = false }, 3000)
      }

      if (!detected) overlayCtx.clearRect(0, 0, w, h)
    }

    prevFrameRef.current = current
    rafRef.current = requestAnimationFrame(analyze)
  }, [videoRef, sensitivity, onMotion, motionEnabled])

  useEffect(() => {
    if (isActive && motionEnabled) {
      rafRef.current = requestAnimationFrame(analyze)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setMotionLevel(0)
      setIsMotion(false)
      prevFrameRef.current = null
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isActive, motionEnabled, analyze])

  const toggleMotion = useCallback(() => setMotionEnabled(prev => !prev), [])

  return {
    motionLevel,
    isMotion,
    motionEnabled,
    toggleMotion,
    overlayCanvasRef,
  }
}
