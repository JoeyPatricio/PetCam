import React, { useState, useRef, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as mobilenetModule from '@tensorflow-models/mobilenet'

// ── Constants ────────────────────────────────────────────────────────────────
const LABELS      = ['grooming', 'normal', 'standing', 'yawn', 'zoomies']
const LABEL_COLOR = {
  grooming: '#dc82ff',
  normal:   '#88aaff',
  standing: '#ff9f3c',
  yawn:     '#ffd264',
  zoomies:  '#7dff7d',
}
const FRAMES_PER_CLIP = 8   // frames sampled per clip
const EMBEDDING_DIM   = 1280 // MobileNet v2 alpha=1.0 embedding size
const EPOCHS          = 40
const BATCH_SIZE      = 16
const LEARNING_RATE   = 0.001

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract N evenly-spaced frames from a video element as ImageData */
async function extractFrames(videoEl, n) {
  const canvas  = document.createElement('canvas')
  canvas.width  = 224
  canvas.height = 224
  const ctx     = canvas.getContext('2d')
  const frames  = []
  const duration = videoEl.duration

  for (let i = 0; i < n; i++) {
    const t = duration > 0 ? (i / (n - 1 || 1)) * duration * 0.95 : 0
    await seekTo(videoEl, t)
    ctx.drawImage(videoEl, 0, 0, 224, 224)
    frames.push(ctx.getImageData(0, 0, 224, 224))
  }
  return frames
}

function seekTo(video, time) {
  return new Promise(resolve => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve() }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

/** Load a video from a src URL and return the HTMLVideoElement (metadata loaded) */
function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.preload = 'auto'
    v.onloadeddata = () => resolve(v)
    v.onerror = reject
    v.src = src
    v.load()
  })
}

/** Run mobilenet.infer on an ImageData, return 1-D tensor (1280 for MobileNet v2 alpha=1.0) */
function embedFrame(mobilenet, imageData) {
  return tf.tidy(() => {
    const img = tf.browser.fromPixels(imageData)
    return mobilenet.infer(img, true).squeeze() // [1280]
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TrainingStudio() {
  const [phase, setPhase]           = useState('idle')   // idle | loading-model | extracting | training | done | error
  const [log, setLog]               = useState([])
  const [progress, setProgress]     = useState({ current: 0, total: 0, label: '' })
  const [metrics, setMetrics]       = useState(null)     // { accuracy, valAccuracy, confMatrix }
  const [modelInfo, setModelInfo]   = useState(null)     // saved model metadata
  const stopRef                     = useRef(false)

  const addLog = useCallback((msg, type = 'info') => {
    setLog(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }])
  }, [])

  // ── Main training pipeline ─────────────────────────────────────────────────
  const runTraining = useCallback(async () => {
    stopRef.current = false
    setPhase('loading-model')
    setLog([])
    setMetrics(null)

    try {
      // 1 ── Fetch labeled clips from server
      addLog('Fetching labels from server…')
      const labelsRes = await fetch('/api/labels')
      const { labels } = await labelsRes.json()
      const entries = Object.entries(labels).filter(([, l]) => LABELS.includes(l))
      addLog(`Found ${entries.length} labeled clips`)

      const recRes = await fetch('/api/recordings')
      const { recordings } = await recRes.json()
      const recSet = new Set(recordings.map(r => r.filename))

      const valid = entries.filter(([fn]) => recSet.has(fn))
      addLog(`${valid.length} clips have video files on disk`)

      if (valid.length < 10) throw new Error('Not enough labeled clips to train (need ≥ 10)')

      // 2 ── Load MobileNet
      addLog('Loading MobileNet v2…')
      await tf.ready()
      const mobilenet = await mobilenetModule.load({ version: 2, alpha: 1.0 })
      addLog('MobileNet loaded ✓')

      // 3 ── Extract features
      setPhase('extracting')
      addLog(`Extracting features from ${valid.length} clips (${FRAMES_PER_CLIP} frames each)…`)

      const features = []
      const targets  = []
      setProgress({ current: 0, total: valid.length, label: '' })

      for (let i = 0; i < valid.length; i++) {
        if (stopRef.current) { addLog('Stopped by user.', 'warn'); setPhase('idle'); return }

        const [filename, label] = valid[i]
        setProgress({ current: i + 1, total: valid.length, label: filename })

        try {
          const video  = await loadVideo(`/recordings/${filename}`)
          const frames = await extractFrames(video, FRAMES_PER_CLIP)

          // Average embeddings across frames
          const embeddings = frames.map(f => embedFrame(mobilenet, f))
          const stacked    = tf.stack(embeddings)     // [N, 1024]
          const mean       = stacked.mean(0)          // [1024]
          const arr        = await mean.data()

          features.push(Array.from(arr))
          targets.push(LABELS.indexOf(label))

          tf.dispose([...embeddings, stacked, mean])
        } catch (err) {
          addLog(`  ⚠ Skipping ${filename}: ${err.message}`, 'warn')
        }
      }

      addLog(`Feature extraction complete: ${features.length} samples`)

      // 4 ── Build + train classifier
      setPhase('training')
      addLog('Building classifier…')

      const xs = tf.tensor2d(features)                              // [N, 1024]
      const ys = tf.oneHot(tf.tensor1d(targets, 'int32'), LABELS.length) // [N, 5]

      // Shuffle indices
      const n = features.length
      const idx = tf.util.createShuffledIndices(n)
      const splitAt = Math.floor(n * 0.8)
      const trainIdx = Array.from(idx).slice(0, splitAt)
      const valIdx   = Array.from(idx).slice(splitAt)

      const gather = (t, indices) => tf.gather(t, tf.tensor1d(indices, 'int32'))
      const xTrain = gather(xs, trainIdx)
      const yTrain = gather(ys, trainIdx)
      const xVal   = gather(xs, valIdx)
      const yVal   = gather(ys, valIdx)

      const model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [EMBEDDING_DIM], units: 256, activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }),
          tf.layers.dropout({ rate: 0.4 }),
          tf.layers.dense({ units: 128, activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: LABELS.length, activation: 'softmax' }),
        ]
      })

      model.compile({
        optimizer: tf.train.adam(LEARNING_RATE),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      })

      addLog(`Training ${splitAt} samples, validating ${valIdx.length}…`)
      addLog(`Architecture: 1024 → 256 → 128 → ${LABELS.length}`)

      const historyLog = []

      await model.fit(xTrain, yTrain, {
        epochs:          EPOCHS,
        batchSize:       BATCH_SIZE,
        validationData:  [xVal, yVal],
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            const acc    = (logs.acc    ?? logs.accuracy   ?? 0)
            const valAcc = (logs.val_acc ?? logs.val_accuracy ?? 0)
            historyLog.push({ epoch, acc, valAcc })
            if ((epoch + 1) % 5 === 0) {
              addLog(`  Epoch ${epoch + 1}/${EPOCHS}  acc=${(acc * 100).toFixed(1)}%  val_acc=${(valAcc * 100).toFixed(1)}%`)
            }
          },
        },
      })

      const lastEpoch  = historyLog[historyLog.length - 1]
      const finalAcc   = lastEpoch.acc
      const finalValAcc = lastEpoch.valAcc

      // 5 ── Confusion matrix on validation set
      const preds  = model.predict(xVal)
      const predIds = Array.from(await preds.argMax(1).data())
      const trueIds = valIdx.map(i => targets[i])

      const confMatrix = LABELS.map(() => Array(LABELS.length).fill(0))
      trueIds.forEach((t, i) => { confMatrix[t][predIds[i]]++ })

      tf.dispose([xs, ys, xTrain, yTrain, xVal, yVal, preds])

      setMetrics({ finalAcc, finalValAcc, confMatrix, history: historyLog })
      addLog(`✅ Training complete — train acc ${(finalAcc * 100).toFixed(1)}%  val acc ${(finalValAcc * 100).toFixed(1)}%`, 'success')

      // 6 ── Save model to server
      addLog('Saving model to server…')

      // Serialize manually to send as JSON
      const saveResult = await new Promise((resolve, reject) => {
        model.save(tf.io.withSaveHandler(async (modelArtifacts) => {
          resolve(modelArtifacts)
          return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } }
        }))
      })

      // weightData is an ArrayBuffer — convert to base64 in chunks to avoid call stack overflow
      const bytes = new Uint8Array(saveResult.weightData)
      let binary = ''
      const CHUNK = 8192
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }
      const weightBase64 = btoa(binary)

      const resp = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelTopology: saveResult.modelTopology,
          weightSpecs:   saveResult.weightSpecs,
          weightData:    weightBase64,
          labels:        LABELS,
        }),
      })

      if (!resp.ok) throw new Error(`Save failed: ${resp.statusText}`)

      const info = await resp.json()
      setModelInfo(info)
      addLog('Model saved to server/model/ ✓', 'success')
      setPhase('done')

    } catch (err) {
      addLog(`Error: ${err.message}`, 'error')
      setPhase('error')
    }
  }, [addLog])

  // ── Render ─────────────────────────────────────────────────────────────────
  const isRunning = phase === 'loading-model' || phase === 'extracting' || phase === 'training'

  return (
    <div className="training-studio">
      {/* Header */}
      <div className="ts-header">
        <span className="ts-title">🧠 Training Studio</span>
        <span className="ts-subtitle">Transfer learning via MobileNet v2</span>
      </div>

      {/* Info cards */}
      <div className="ts-info-row">
        {LABELS.map(l => (
          <div key={l} className="ts-label-chip" style={{ borderColor: LABEL_COLOR[l], color: LABEL_COLOR[l] }}>
            {l}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="ts-controls">
        {!isRunning ? (
          <button className="ts-btn ts-btn-run" onClick={runTraining}>
            ▶ Start Training
          </button>
        ) : (
          <button className="ts-btn ts-btn-stop" onClick={() => { stopRef.current = true }}>
            ■ Stop
          </button>
        )}
      </div>

      {/* Progress bar */}
      {phase === 'extracting' && (
        <div className="ts-progress-wrap">
          <div className="ts-progress-label">
            Extracting features {progress.current}/{progress.total}
          </div>
          <div className="ts-progress-track">
            <div
              className="ts-progress-bar"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className="ts-progress-file">{progress.label}</div>
        </div>
      )}

      {phase === 'training' && (
        <div className="ts-progress-wrap">
          <div className="ts-progress-label">Training classifier…</div>
        </div>
      )}

      {/* Log */}
      <div className="ts-log">
        {log.map((entry, i) => (
          <div key={i} className={`ts-log-line ts-log-${entry.type}`}>
            <span className="ts-log-time">{entry.time}</span>
            <span>{entry.msg}</span>
          </div>
        ))}
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="ts-metrics">
          <div className="ts-metrics-header">Results</div>
          <div className="ts-metrics-row">
            <div className="ts-metric-card">
              <div className="ts-metric-val">{(metrics.finalAcc * 100).toFixed(1)}%</div>
              <div className="ts-metric-label">Train Accuracy</div>
            </div>
            <div className="ts-metric-card">
              <div className="ts-metric-val">{(metrics.finalValAcc * 100).toFixed(1)}%</div>
              <div className="ts-metric-label">Val Accuracy</div>
            </div>
          </div>

          {/* Confusion matrix */}
          <div className="ts-cm-wrap">
            <div className="ts-cm-title">Confusion Matrix (validation)</div>
            <div className="ts-cm" style={{ gridTemplateColumns: `80px repeat(${LABELS.length}, 1fr)` }}>
              {/* Header row */}
              <div className="ts-cm-corner">true ↓ pred →</div>
              {LABELS.map(l => (
                <div key={l} className="ts-cm-head" style={{ color: LABEL_COLOR[l] }}>{l}</div>
              ))}
              {/* Data rows */}
              {LABELS.map((rowLabel, ri) => (
                <React.Fragment key={rowLabel}>
                  <div className="ts-cm-head" style={{ color: LABEL_COLOR[rowLabel] }}>{rowLabel}</div>
                  {LABELS.map((_cl, ci) => {
                    const val   = metrics.confMatrix[ri][ci]
                    const rowSum = metrics.confMatrix[ri].reduce((a, b) => a + b, 0)
                    const pct   = rowSum > 0 ? val / rowSum : 0
                    const isDiag = ri === ci
                    return (
                      <div
                        key={ci}
                        className={`ts-cm-cell ${isDiag ? 'ts-cm-diag' : ''}`}
                        style={{ opacity: 0.2 + pct * 0.8 }}
                      >
                        {val}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .training-studio {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px;
          max-width: 900px;
          margin: 0 auto;
        }

        .ts-header {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }
        .ts-title {
          font-family: var(--font-display);
          font-size: 18px;
          color: var(--text-primary);
        }
        .ts-subtitle {
          font-size: 11px;
          color: var(--text-muted);
        }

        .ts-info-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ts-label-chip {
          font-size: 11px;
          padding: 2px 8px;
          border: 1px solid;
          border-radius: 99px;
          font-family: var(--font-display);
        }

        .ts-controls { display: flex; gap: 8px; }

        .ts-btn {
          padding: 8px 20px;
          border-radius: var(--radius);
          font-size: 13px;
          font-family: var(--font-display);
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .ts-btn:hover { opacity: 0.85; }
        .ts-btn-run {
          background: var(--accent);
          color: #000;
        }
        .ts-btn-stop {
          background: var(--red, #ff4444);
          color: #fff;
        }

        .ts-progress-wrap {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ts-progress-label { font-size: 12px; color: var(--text-secondary); }
        .ts-progress-file  { font-size: 10px; color: var(--text-muted); font-family: monospace; }
        .ts-progress-track {
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
        }
        .ts-progress-bar {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.3s;
        }

        .ts-log {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
          max-height: 220px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 11px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ts-log-line { display: flex; gap: 8px; }
        .ts-log-time { color: var(--text-muted); flex-shrink: 0; }
        .ts-log-info    { color: var(--text-secondary); }
        .ts-log-success { color: #7dff7d; }
        .ts-log-warn    { color: #ffd264; }
        .ts-log-error   { color: #ff6b6b; }

        .ts-metrics {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ts-metrics-header {
          font-family: var(--font-display);
          font-size: 13px;
          color: var(--text-secondary);
        }
        .ts-metrics-row { display: flex; gap: 12px; }
        .ts-metric-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 16px;
          text-align: center;
          min-width: 100px;
        }
        .ts-metric-val {
          font-size: 24px;
          font-family: var(--font-display);
          color: var(--accent);
        }
        .ts-metric-label { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

        .ts-cm-wrap { display: flex; flex-direction: column; gap: 6px; }
        .ts-cm-title { font-size: 11px; color: var(--text-muted); }
        .ts-cm {
          display: grid;
          gap: 2px;
        }
        .ts-cm-corner {
          font-size: 8px;
          color: var(--text-muted);
          display: flex;
          align-items: flex-end;
          padding-bottom: 4px;
        }
        .ts-cm-head {
          font-size: 9px;
          text-align: center;
          padding: 3px 2px;
          font-family: var(--font-display);
        }
        .ts-cm-cell {
          background: #88aaff;
          text-align: center;
          font-size: 11px;
          padding: 4px 2px;
          border-radius: 2px;
          color: #fff;
          font-family: var(--font-display);
        }
        .ts-cm-diag { background: #7dff7d; color: #000; }
      `}</style>
    </div>
  )
}
