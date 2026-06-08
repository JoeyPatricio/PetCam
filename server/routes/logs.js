import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_FILE = path.join(__dirname, '..', 'activity-log.json')

const router = express.Router()

// Helpers
async function readLog() {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeLog(entries) {
  await fs.writeFile(LOG_FILE, JSON.stringify(entries, null, 2))
}

// GET /api/logs — return persisted log entries
router.get('/', async (_req, res) => {
  const entries = await readLog()
  res.json({ entries })
})

// POST /api/logs — append one or more entries
router.post('/', async (req, res) => {
  const { entry } = req.body
  if (!entry) return res.status(400).json({ error: 'No entry provided' })

  const entries = await readLog()
  const newEntry = { ...entry, id: Date.now(), savedAt: new Date().toISOString() }
  entries.push(newEntry)

  // Keep log file manageable (last 1000 entries)
  const trimmed = entries.slice(-1000)
  await writeLog(trimmed)

  res.json({ entry: newEntry })
})

// DELETE /api/logs — clear the log
router.delete('/', async (_req, res) => {
  await writeLog([])
  res.json({ cleared: true })
})

export default router
