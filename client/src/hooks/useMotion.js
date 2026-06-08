import { useState, useEffect, useRef, useCallback } from 'react'

const LUMA_AUTO_ON  = 70   // enable NV when avg luma drops below this
const LUMA_AUTO_OFF = 90   // disable NV when luma rises above this (hysteresis)
const NV_BOOST      = 3.5  // brightness multiplier in NV mode

function applyNightVision(imageData) {
  const src  = imageData.data
  const out  = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    const L      = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
    const bright = Math.min(255, L * NV_BOOST)
    out[i]     = bright * 0.15   // R
    out[i + 1] = bright          // G  (green tint)
    out[i + 2] = bright * 0.15   // B
    out[i + 3] = src[i + 3]      // A
  }
  return new ImageData(out, imageData.width, imageData.height)
}

/**
 * useMotion
 * Frame-by-frame pixel difference motion detection using an offscreen canvas.
 * Includes auto night-vision mode that activates when the scene is too dark.
 *
 * Props:
 *   videoRef         - ref to the live <video> element
 *   isActive         - whether the camera is running
 *   sensitivity      - 0–100 (higher = more sensitive, default 30)
 *   onMotion         - callback(event) fired when motion is detected
 *
 * Returns:
 *   motionLevel       - 0–100 current motion intensity
 *   isMotion          - boolean
 *   motionEnabled     - whether detection is running
 *   toggleMotion      - fn() to enable/disable detection
 *   overlayCanvasRef  - attach to a <canvas> overlay for visual diff
 *   nightVisionActive - boolean — NV is on (auto or manual)
 *   nightVisionForced - boolean — user manually forced NV on
 *   nightVisionCanvasRef - attach to a <canvas> that shows the NV image
 *   toggleNightVision - fn() to toggle manual NV override
 */
export function useMotion({ videoRef, isActive, sensitivity = 30, onMotion }) {
  const [motionLevel,    setMotionLevel]    = useState(0)
  const [isMotion,       setIsMotion]       = useState(false)
  const [motionEnabled,  setMotionEnabled]  = useState(true)
  const [nightVisionForced, setNightVisionForced] = useState(false)
  const [nightVisionAuto,   setNightVisionAuto]   = useState(false)

  const overlayCanvasRef    = useRef(null)
  const nightVisionCanvasRef = useRef(null)
  const nvOffscreenRef      = useRef(null)   // reusable full-res offscreen canvas
  const prevFrameRef        = useRef(null)
  const rafRef              = useRef(null)
  const motionCooldownRef   = useRef(false)
  const nvAutoRef           = useRef(false)  // shadow of nightVisionAuto to avoid stale closure

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

    const nightVisionActive = nightVisionForced || nvAutoRef.current

    // ── 1/4-res offscreen for motion detection ──────────────────────────────
    const sw = Math.floor(w / 4)
    const sh = Math.floor(h / 4)

    const offscreen = document.createElement('canvas')
    offscreen.width  = sw
    offscreen.height = sh
    const ctx = offscreen.getContext('2d')
    ctx.drawImage(video, 0, 0, sw, sh)
    const rawFrame = ctx.getImageData(0, 0, sw, sh)

    // ── Auto-luminance check (every frame, cheap on small canvas) ───────────
    {
      const d = rawFrame.data
      let total = 0
      for (let i = 0; i < d.length; i += 4) {
        total += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      }
      const avgLuma = total / (sw * sh)
      const shouldBeAuto = nvAutoRef.current
        ? avgLuma < LUMA_AUTO_OFF
        : avgLuma < LUMA_AUTO_ON

      if (shouldBeAuto !== nvAutoRef.current) {
        nvAutoRef.current = shouldBeAuto
        setNightVisionAuto(shouldBeAuto)
      }
    }

    // Apply NV boost to the motion-detection frame so low-light diffs are amplified
    const motionFrame = nightVisionActive ? applyNightVision(rawFrame) : rawFrame

    // ── Motion detection ────────────────────────────────────────────────────
    if (prevFrameRef.current) {
      const prev  = prevFrameRef.current.data
      const curr  = motionFrame.data
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
          overlayCtx.fillStyle = nightVisionActive
            ? 'rgba(100, 255, 100, 0.3)'   // green tint for NV mode
            : 'rgba(200, 169, 110, 0.25)'   // gold for normal mode
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

    prevFrameRef.current = motionFrame

    // ── Night vision display canvas ─────────────────────────────────────────
    const nvCanvas = nightVisionCanvasRef.current
    if (nvCanvas) {
      if (nightVisionActive) {
        // Reuse a persistent offscreen canvas for full-res processing
        if (!nvOffscreenRef.current) {
          nvOffscreenRef.current = document.createElement('canvas')
        }
        const nv = nvOffscreenRef.current
        nv.width  = w
        nv.height = h
        const nvCtx = nv.getContext('2d')
        nvCtx.drawImage(video, 0, 0, w, h)
        const fullFrame    = nvCtx.getImageData(0, 0, w, h)
        const boostedFrame = applyNightVision(fullFrame)

        nvCanvas.width  = w
        nvCanvas.height = h
        nvCanvas.getContext('2d').putImageData(boostedFrame, 0, 0)
      } else {
        // Clear NV canvas so the raw video element shows through
        const c = nvCanvas.getContext('2d')
        c.clearRect(0, 0, nvCanvas.width, nvCanvas.height)
      }
    }

    rafRef.current = requestAnimationFrame(analyze)
  }, [videoRef, sensitivity, onMotion, nightVisionForced])

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

  const toggleNightVision = useCallback(() => setNightVisionForced(prev => !prev), [])

  return {
    motionLevel,
    isMotion,
    motionEnabled,
    toggleMotion,
    overlayCanvasRef,
    nightVisionActive: nightVisionForced || nightVisionAuto,
    nightVisionForced,
    nightVisionCanvasRef,
    toggleNightVision,
  }
}
