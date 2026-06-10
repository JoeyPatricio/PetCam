import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const MODEL_DIR  = path.join(__dirname, '..', 'model')

const router = express.Router()

await fs.mkdir(MODEL_DIR, { recursive: true })

// POST /api/model — save tfjs model (model.json + weights)
// Body: { modelJson: {...}, weightData: [...] }  (weights as base64)
router.post('/', async (req, res) => {
  try {
    const { modelTopology, weightSpecs, weightData, labels } = req.body
    if (!modelTopology || !weightData) {
      return res.status(400).json({ error: 'Missing modelTopology or weightData' })
    }

    const modelJson = {
      modelTopology,
      weightsManifest: [{
        paths: ['weights.bin'],
        weights: weightSpecs,
      }],
    }

    await fs.writeFile(
      path.join(MODEL_DIR, 'model.json'),
      JSON.stringify(modelJson),
      'utf-8'
    )

    // weightData is base64-encoded binary
    const buf = Buffer.from(weightData, 'base64')
    await fs.writeFile(path.join(MODEL_DIR, 'weights.bin'), buf)

    // Save label map so inference knows which index = which class
    if (labels) {
      await fs.writeFile(
        path.join(MODEL_DIR, 'labels.json'),
        JSON.stringify(labels, null, 2),
        'utf-8'
      )
    }

    res.json({ saved: true, path: MODEL_DIR })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save model', detail: err.message })
  }
})

// GET /api/model — check if model exists + return metadata
router.get('/', async (_req, res) => {
  try {
    const modelPath = path.join(MODEL_DIR, 'model.json')
    const labelsPath = path.join(MODEL_DIR, 'labels.json')
    await fs.access(modelPath)
    const labels = JSON.parse(await fs.readFile(labelsPath, 'utf-8').catch(() => 'null'))
    const stat = await fs.stat(modelPath)
    res.json({ exists: true, savedAt: stat.mtime.toISOString(), labels })
  } catch {
    res.json({ exists: false })
  }
})

export default router
