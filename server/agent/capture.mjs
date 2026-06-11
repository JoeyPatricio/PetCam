/**
 * BunnyCam Camera Agent
 * ─────────────────────
 * Headless capture + inference service. Runs identically on a PC and a
 * Raspberry Pi — only the camera input config differs (.env):
 *
 *   Windows PC:  CAMERA_FORMAT=dshow  CAMERA_INPUT=video=onn 4K Webcam
 *   Raspberry Pi: CAMERA_FORMAT=v4l2  CAMERA_INPUT=/dev/video0
 *
 * Pipeline:
 *   ffmpeg (one process) ──► raw 224×224 frames every 3s ──► motion check
 *                       └──► rolling 12s webm segments in tmp/segments/
 *   frame ──► MobileNetV2 ──► classifier ──► prediction
 *   non-normal prediction ──► upload latest segment ──► label + email
 *
 * All API calls go through the same server endpoints the web app uses.
 */

import 'dotenv/config'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import * as tf from '@tensorflow/tfjs'
import * as mobilenetModule from '@tensorflow-models/mobilenet'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────────────
const SERVER         = process.env.AGENT_SERVER_URL  ?? 'http://localhost:3001'
const CAMERA_FORMAT  = process.env.CAMERA_FORMAT     ?? 'dshow'
const CAMERA_INPUT   = process.env.CAMERA_INPUT      ?? 'video=onn 4K Webcam'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const FRAME_INTERVAL = Number(process.env.AGENT_FRAME_SECONDS ?? 3)
const SEGMENT_SECS   = Number(process.env.AGENT_SEGMENT_SECONDS ?? 12)
const MOTION_THRESH  = Number(process.env.AGENT_MOTION_THRESHOLD ?? 9)
const CONF_THRESH    = Number(process.env.AGENT_CONFIDENCE_THRESHOLD ?? 70)
// Below this motion level, treat the frame as "nothing happening" (blank/static
// room) and never alert — the classifier still picks a class but we ignore it.
const MOTION_FLOOR   = Number(process.env.AGENT_MOTION_FLOOR ?? 4)
// Require the same alert label across this many consecutive frames before
// emailing — rejects single-frame flicker false positives.
const ALERT_STREAK   = Number(process.env.AGENT_ALERT_STREAK ?? 3)

const SEG_DIR    = path.join(__dirname, 'segments')
const FRAME_SIZE = 224 * 224 * 3

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a)

// ── Auth ────────────────────────────────────────────────────────────────────
let cookie = ''

async function login() {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Agent login failed: ${(await res.json()).error}`)
  cookie = res.headers.get('set-cookie').split(';')[0]
  log('✓ Logged in to server')
}

const api = async (route, opts = {}) => {
  const call = () => fetch(`${SERVER}${route}`, {
    ...opts,
    headers: { ...(opts.headers ?? {}), Cookie: cookie },
  })
  let res = await call()
  // Server restarts wipe in-memory sessions — re-login and retry once
  if (res.status === 401) {
    await login().catch(() => {})
    res = await call()
  }
  return res
}

// ── Models ──────────────────────────────────────────────────────────────────
let mobilenet, classifier, labels

async function loadModels() {
  log('Loading MobileNetV2…')
  mobilenet = await mobilenetModule.load({ version: 2, alpha: 1.0 })
  log('Loading classifier from server…')
  classifier = await tf.loadLayersModel(`${SERVER}/model/model.json`)
  labels = await (await fetch(`${SERVER}/model/labels.json`)).json()
  log(`✓ Models ready (classes: ${labels.join(', ')})`)
}

function classify(frameBuf) {
  return tf.tidy(() => {
    const img    = tf.tensor3d(frameBuf, [224, 224, 3], 'int32')
    const embed  = mobilenet.infer(img, true)
    const probs  = classifier.predict(embed).squeeze()
    const idx    = probs.argMax().dataSync()[0]
    const conf   = Math.round(probs.dataSync()[idx] * 100)
    return { label: labels[idx], confidence: conf }
  })
}

// ── Motion detection (mean absolute pixel difference) ──────────────────────
let prevFrame = null

function motionLevel(frameBuf) {
  if (!prevFrame) { prevFrame = Buffer.from(frameBuf); return 0 }
  let sum = 0
  // Sample every 16th byte for speed
  for (let i = 0; i < frameBuf.length; i += 16) {
    sum += Math.abs(frameBuf[i] - prevFrame[i])
  }
  prevFrame = Buffer.from(frameBuf)
  return sum / (frameBuf.length / 16)
}

// ── Segment upload ──────────────────────────────────────────────────────────
async function latestFinishedSegment() {
  const files = (await fs.readdir(SEG_DIR)).filter(f => f.endsWith('.webm')).sort()
  // The newest file is still being written — take the one before it
  return files.length >= 2 ? files[files.length - 2] : null
}

async function uploadAndAlert(pred) {
  const seg = await latestFinishedSegment()
  if (!seg) { log('  (no finished segment yet — skipping upload)'); return }

  const buf  = await fs.readFile(path.join(SEG_DIR, seg))
  const form = new FormData()
  form.append('video', new Blob([buf], { type: 'video/webm' }), 'clip.webm')

  const up = await api('/api/recordings', { method: 'POST', body: form })
  if (!up.ok) { log('  upload failed:', up.status); return }
  const { filename } = await up.json()
  log(`  ↑ Uploaded clip ${filename} → labeled ${pred.label}`)

  // Auto-label the clip with the model's predicted behavior, using the standard
  // label (no ml_ prefix) so it's indistinguishable from a hand label.
  await api(`/api/labels/${filename}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: pred.label }),
  }).catch(() => {})

  const sms = await api('/api/sms/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: pred.label, confidence: pred.confidence, filename }),
  })
  const result = await sms.json()
  log(`  ✉ Email: ${result.sent ? 'sent' : result.reason ?? result.error}`)
}

// ── Cleanup old segments (keep last ~10 minutes) ───────────────────────────
async function pruneSegments() {
  const keep = Math.ceil(600 / SEGMENT_SECS)
  const files = (await fs.readdir(SEG_DIR)).filter(f => f.endsWith('.webm')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - keep))) {
    await fs.unlink(path.join(SEG_DIR, f)).catch(() => {})
  }
}

// ── Main capture loop ───────────────────────────────────────────────────────
let lastLabel   = null
let streakLabel = null
let streakCount = 0

async function handleFrame(frameBuf) {
  const motion = motionLevel(frameBuf)
  const pred   = classify(frameBuf)

  // A candidate alert must be a non-normal behavior, confident enough, AND
  // accompanied by real motion (kills blank/static-room false positives).
  const candidate = pred.label !== 'normal' &&
                    pred.confidence >= CONF_THRESH &&
                    motion >= MOTION_FLOOR

  // Debounce: count consecutive frames of the same candidate label
  if (candidate && pred.label === streakLabel) {
    streakCount++
  } else if (candidate) {
    streakLabel = pred.label
    streakCount = 1
  } else {
    streakLabel = null
    streakCount = 0
  }

  const isAlert = candidate && streakCount >= ALERT_STREAK

  log(`frame  motion=${motion.toFixed(1)}  →  ${pred.label} ${pred.confidence}%` +
      `${candidate ? `  (streak ${streakCount}/${ALERT_STREAK})` : ''}` +
      `${isAlert ? '  ⚠ ALERT' : ''}`)

  // Publish every label *change* to the public demo feed
  if (pred.label !== lastLabel) {
    lastLabel = pred.label
    api('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pred),
    }).catch(() => {})
  }

  if (isAlert) {
    streakCount = 0 // reset so we don't re-fire every frame; server cooldown also guards
    await uploadAndAlert(pred).catch(err => log('  alert error:', err.message))
  }
}

let paused = false
let ffProc = null

function startCapture() {
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-f', CAMERA_FORMAT,
    ...(CAMERA_FORMAT === 'dshow' ? ['-rtbufsize', '100M'] : []),
    '-i', CAMERA_INPUT,
    // Output 1: raw frames for inference
    '-vf', `fps=1/${FRAME_INTERVAL},scale=224:224`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    // Output 2: rolling recorded segments
    '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8',
    '-b:v', '1M', '-vf', 'scale=640:360', '-an',
    '-f', 'segment', '-segment_time', String(SEGMENT_SECS), '-reset_timestamps', '1',
    path.join(SEG_DIR, 'seg-%05d.webm'),
    // Output 3: MJPEG live-view frames for the dashboard (smooth ~12 fps)
    '-vf', 'fps=12,scale=640:360', '-q:v', '5',
    '-f', 'mjpeg', 'pipe:3',
  ]

  const ff = spawn(ffmpegInstaller.path, args, {
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  })
  ffProc = ff
  log(`✓ Camera capture started (${CAMERA_FORMAT}: ${CAMERA_INPUT})`)

  let pending = Buffer.alloc(0)
  let busy = false

  ff.stdout.on('data', chunk => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= FRAME_SIZE) {
      const frame = pending.subarray(0, FRAME_SIZE)
      pending = pending.subarray(FRAME_SIZE)
      if (!busy) {
        busy = true
        handleFrame(Buffer.from(frame)).finally(() => { busy = false })
      }
    }
  })

  // Parse MJPEG stream from pipe:3 and push frames to the server for live view
  let jpegBuf = Buffer.alloc(0)
  ff.stdio[3].on('data', chunk => {
    jpegBuf = Buffer.concat([jpegBuf, chunk])
    // Find complete JPEGs: FFD8 … FFD9
    while (true) {
      const start = jpegBuf.indexOf(Buffer.from([0xff, 0xd8]))
      if (start === -1) { jpegBuf = Buffer.alloc(0); break }
      const end = jpegBuf.indexOf(Buffer.from([0xff, 0xd9]), start + 2)
      if (end === -1) { jpegBuf = jpegBuf.subarray(start); break }
      const frame = jpegBuf.subarray(start, end + 2)
      jpegBuf = jpegBuf.subarray(end + 2)
      api('/api/stream/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: Buffer.from(frame),
      }).catch(() => {})
    }
  })

  ff.stderr.on('data', d => {
    const msg = d.toString().trim()
    if (msg) log('ffmpeg:', msg)
  })

  ff.on('close', code => {
    ffProc = null
    if (paused) {
      log('Capture stopped — monitoring is OFF')
      return
    }
    log(`ffmpeg exited (${code}) — restarting in 5s…`)
    setTimeout(() => { if (!paused) startCapture() }, 5000)
  })
}

// ── Monitor toggle polling ──────────────────────────────────────────────────
async function pollMonitor() {
  try {
    const { enabled } = await (await fetch(`${SERVER}/api/monitor`)).json()
    if (!enabled && !paused) {
      paused = true
      log('⏸ Monitoring turned OFF from dashboard — releasing camera')
      if (ffProc) ffProc.kill('SIGTERM')
      prevFrame = null
      lastLabel = null
    } else if (enabled && paused) {
      paused = false
      log('▶ Monitoring turned ON from dashboard — starting capture')
      startCapture()
    }
  } catch { /* server unreachable — keep current state */ }
}

// ── Boot ────────────────────────────────────────────────────────────────────
console.log('🐇 BunnyCam Agent starting…')
await fs.mkdir(SEG_DIR, { recursive: true })
await login()
await loadModels()

const initial = await (await fetch(`${SERVER}/api/monitor`)).json().catch(() => ({ enabled: true }))
if (initial.enabled === false) {
  paused = true
  log('⏸ Monitoring is OFF — camera idle until enabled from dashboard')
} else {
  startCapture()
}

setInterval(pollMonitor, 5000)
setInterval(() => pruneSegments().catch(() => {}), 60_000)
