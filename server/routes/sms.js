import express from 'express'
import nodemailer from 'nodemailer'
import path from 'path'
import { fileURLToPath } from 'url'
import { readMonitorState } from './monitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router    = express.Router()

const ALERT_LABELS = new Set(['zoomies','yawn','grooming','standing'])

const LABEL_PHRASE = {
  zoomies:  'doing zoomies 🐇💨',
  yawn:     'yawning 😪',
  grooming: 'grooming 🐾',
  standing: 'standing up 🦘',
}

// Global cooldown — one timer across ALL alert behaviors, so flickering
// predictions (standing↔zoomies↔grooming) can't each fire their own email.
let lastSentAny = 0

function isConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_TO)
}

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
}

// GET /api/sms/status
router.get('/status', (_req, res) => {
  res.json({
    configured:      isConfigured(),
    cooldownMinutes: Number(process.env.NOTIFY_COOLDOWN_MINUTES ?? 10),
  })
})

// POST /api/sms/notify
// Body: { label: string, confidence?: number, filename?: string }
router.post('/notify', async (req, res) => {
  const { label, confidence, filename } = req.body

  if (!ALERT_LABELS.has(label)) {
    return res.json({ sent: false, reason: 'label not an alert trigger' })
  }
  if (!isConfigured()) {
    return res.json({ sent: false, reason: 'email not configured — add .env' })
  }

  // Respect the dashboard's email-alerts toggle
  const { emailAlerts } = await readMonitorState()
  if (!emailAlerts) {
    return res.json({ sent: false, reason: 'email alerts disabled from dashboard' })
  }

  // Global cooldown check (one timer for all behaviors)
  const cooldownMs = Number(process.env.NOTIFY_COOLDOWN_MINUTES ?? 10) * 60 * 1000
  const now        = Date.now()
  if (lastSentAny && now - lastSentAny < cooldownMs) {
    const waitMin = Math.ceil((cooldownMs - (now - lastSentAny)) / 60000)
    return res.json({ sent: false, reason: `cooldown — ${waitMin}m remaining` })
  }

  try {
    const phrase    = LABEL_PHRASE[label] ?? label
    const confStr   = confidence ? ` (${confidence}% confidence)` : ''
    const subject   = `🐇 BunnyCam Alert: bunny is ${phrase}`
    const text      = `Your bunny is ${phrase}${confStr}!\n\nBunnyCam detected this at ${new Date().toLocaleTimeString()}.`

    const mailOptions = {
      from:    `"BunnyCam 🐇" <${process.env.EMAIL_USER}>`,
      to:      process.env.NOTIFY_TO,
      subject,
      text,
    }

    // Attach the clip if a filename was provided
    if (filename) {
      const clipPath = path.join(__dirname, '..', 'recordings', filename)
      mailOptions.attachments = [{
        filename,
        path: clipPath,
      }]
    }

    const transporter = createTransport()
    await transporter.sendMail(mailOptions)

    lastSentAny = now
    res.json({ sent: true, label, hasAttachment: !!filename })
  } catch (err) {
    console.error('Email send failed:', err.message)
    res.status(500).json({ sent: false, error: err.message })
  }
})

export default router
