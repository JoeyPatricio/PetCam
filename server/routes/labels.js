import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const LABELS_FILE = path.join(__dirname, '..', 'labels.json')

const router = express.Router()

async function readLabels() {
  try {
    const raw = await fs.readFile(LABELS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeLabels(labels) {
  await fs.writeFile(LABELS_FILE, JSON.stringify(labels, null, 2))
}

// GET /api/labels — return all labels
router.get('/', async (_req, res) => {
  try {
    const labels = await readLabels()
    res.json({ labels })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read labels', detail: err.message })
  }
})

// POST /api/labels/:filename — set label for a clip
router.post('/:filename', async (req, res) => {
  const { filename } = req.params
  const { label } = req.body

  if (!filename.startsWith('recording-') || !filename.endsWith('.webm')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  if (!['binky', 'yawn', 'normal'].includes(label)) {
    return res.status(400).json({ error: 'Label must be "binky", "yawn", or "normal"' })
  }

  try {
    const labels = await readLabels()
    labels[filename] = label
    await writeLabels(labels)
    res.json({ filename, label })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save label', detail: err.message })
  }
})

// DELETE /api/labels/:filename — remove label from a clip
router.delete('/:filename', async (req, res) => {
  const { filename } = req.params

  try {
    const labels = await readLabels()
    delete labels[filename]
    await writeLabels(labels)
    res.json({ deleted: filename })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete label', detail: err.message })
  }
})

export default router
