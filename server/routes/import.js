import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import { fileURLToPath } from 'url'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const __dirname     = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings')
const TMP_DIR        = path.join(__dirname, '..', 'tmp')

await fs.mkdir(RECORDINGS_DIR, { recursive: true })
await fs.mkdir(TMP_DIR,        { recursive: true })

const router = express.Router()

const ACCEPTED_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/x-matroska', 'video/avi',
]

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB raw import
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_TYPES.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|mkv|webm|m4v)$/i)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
})

function convertToWebm(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libvpx-vp9',
        '-crf 33',
        '-b:v 0',
        '-an',           // strip audio (not needed for ML)
        '-t 30',         // cap at 30s — trim long clips
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2', // normalize to 720p
      ])
      .format('webm')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath)
  })
}

// POST /api/import  — multipart, field name "videos", up to 20 files at once
router.post('/', upload.array('videos', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' })
  }

  const results = []

  for (const file of req.files) {
    const timestamp  = new Date().toISOString().replace(/[:.]/g, '-')
    const outName    = `recording-import-${timestamp}-${Math.random().toString(36).slice(2, 6)}.webm`
    const outPath    = path.join(RECORDINGS_DIR, outName)

    try {
      if (file.mimetype === 'video/webm') {
        // Already webm — just move it
        await fs.rename(file.path, outPath)
      } else {
        await convertToWebm(file.path, outPath)
        await fs.unlink(file.path).catch(() => {})
      }

      const stat = await fs.stat(outPath)
      results.push({ filename: outName, size: stat.size, original: file.originalname, status: 'ok' })
    } catch (err) {
      await fs.unlink(file.path).catch(() => {})
      results.push({ original: file.originalname, status: 'error', detail: err.message })
    }
  }

  const failed = results.filter(r => r.status === 'error')
  res.status(failed.length === results.length ? 500 : 200).json({ results })
})

export default router
