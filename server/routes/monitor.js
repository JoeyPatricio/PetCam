import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(__dirname, '..', 'monitor.json')

const router = express.Router()

const DEFAULTS = { enabled: true, emailAlerts: true }

export async function readMonitorState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(await fs.readFile(STATE_FILE, 'utf-8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

// GET /api/monitor — public (demo page shows online/offline anyway)
router.get('/', async (_req, res) => {
  res.json(await readMonitorState())
})

// POST /api/monitor { enabled?, emailAlerts? } — admin only (guarded in index.js)
router.post('/', async (req, res) => {
  const current = await readMonitorState()
  const next = { ...current }
  if ('enabled' in req.body)     next.enabled     = !!req.body.enabled
  if ('emailAlerts' in req.body) next.emailAlerts = !!req.body.emailAlerts
  await fs.writeFile(STATE_FILE, JSON.stringify(next))
  res.json(next)
})

export default router
