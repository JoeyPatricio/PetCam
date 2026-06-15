import express from 'express'

const router = express.Router()

// In-memory ring buffer of recent predictions for the public demo feed
const MAX_EVENTS = 50
const SERVER_START = new Date().toISOString()
let events = []

// GET /api/predictions — public: text-only live feed (no video involved)
// Events older than this server's start time are filtered so stale predictions
// from a previous run don't persist across restarts.
router.get('/', (_req, res) => {
  res.json({ events: events.filter(e => e.time >= SERVER_START) })
})

// POST /api/predictions — admin client reports a prediction change
// (protected by adminGuard in index.js)
router.post('/', (req, res) => {
  const { label, confidence } = req.body
  if (!label) return res.status(400).json({ error: 'label required' })

  events.push({ label, confidence: confidence ?? null, time: new Date().toISOString() })
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  res.json({ ok: true })
})

export default router
