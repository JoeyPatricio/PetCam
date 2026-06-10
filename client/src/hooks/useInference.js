import { useState, useEffect, useRef, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as mobilenetModule from '@tensorflow-models/mobilenet'

const INFERENCE_INTERVAL_MS = 3000
const LABEL_COLOR = {
  grooming: '#dc82ff',
  normal:   '#88aaff',
  standing: '#ff9f3c',
  yawn:     '#ffd264',
  zoomies:  '#7dff7d',
}

export function useInference({ videoRef, isActive, enabled }) {
  const [status, setStatus]         = useState('idle') // idle | loading | ready | error
  const [prediction, setPrediction] = useState(null)   // { label, confidence, color }
  const [modelExists, setModelExists] = useState(null) // null = unchecked

  const mobilenetRef  = useRef(null)
  const classifierRef = useRef(null)
  const labelsRef     = useRef([])
  const intervalRef   = useRef(null)
  const canvasRef     = useRef(null)

  // Check if a trained model is saved on the server
  useEffect(() => {
    fetch('/api/model')
      .then(r => r.json())
      .then(d => setModelExists(d.exists))
      .catch(() => setModelExists(false))
  }, [])

  const loadModels = useCallback(async () => {
    if (status === 'loading' || status === 'ready') return
    setStatus('loading')
    try {
      await tf.ready()

      // Load MobileNet backbone (same as training)
      if (!mobilenetRef.current) {
        mobilenetRef.current = await mobilenetModule.load({ version: 2, alpha: 1.0 })
      }

      // Load the trained classifier from server
      classifierRef.current = await tf.loadLayersModel('/model/model.json')

      // Load label map
      const labelsRes = await fetch('/model/labels.json')
      labelsRef.current = await labelsRes.json()

      // Reusable 224×224 canvas for frame capture
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
        canvasRef.current.width  = 224
        canvasRef.current.height = 224
      }

      setStatus('ready')
    } catch (err) {
      console.error('Inference model load failed:', err)
      setStatus('error')
    }
  }, [status])

  const runOnce = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    if (!mobilenetRef.current || !classifierRef.current) return

    tf.tidy(() => {
      const ctx = canvasRef.current.getContext('2d')
      ctx.drawImage(video, 0, 0, 224, 224)

      const img       = tf.browser.fromPixels(canvasRef.current)
      const embedding = mobilenetRef.current.infer(img, true)       // [1, 1280]
      const logits    = classifierRef.current.predict(embedding)     // [1, 5]
      const probs     = logits.squeeze()                             // [5]
      const predIdx   = probs.argMax().dataSync()[0]
      const confidence = probs.dataSync()[predIdx]

      const label = labelsRef.current[predIdx] ?? `class_${predIdx}`
      setPrediction({
        label,
        confidence: Math.round(confidence * 100),
        color: LABEL_COLOR[label] ?? '#ffffff',
      })
    })
  }, [videoRef])

  // Start / stop inference interval when enabled + ready + active
  useEffect(() => {
    if (enabled && status === 'ready' && isActive) {
      runOnce() // immediate first reading
      intervalRef.current = setInterval(runOnce, INFERENCE_INTERVAL_MS)
    } else {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      if (!isActive || !enabled) setPrediction(null)
    }
    return () => clearInterval(intervalRef.current)
  }, [enabled, status, isActive, runOnce])

  // Auto-load when enabled
  useEffect(() => {
    if (enabled && modelExists && status === 'idle') {
      loadModels()
    }
  }, [enabled, modelExists, status, loadModels])

  return { status, prediction, modelExists, loadModels }
}
