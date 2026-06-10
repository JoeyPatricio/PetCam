/**
 * convert-batch.mjs
 * Processes all MP4s in server/recordings/binky|yawn|groom|stand subfolders.
 * Long videos (>30s) are split into 25s clips. All output goes to recordings/ root as webm.
 *
 * Usage: node server/scripts/convert-batch.mjs
 */

import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'
import { execFile } from 'child_process'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const __dirname      = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings')
const CLIP_DURATION  = 25  // seconds per clip
const CONCURRENCY    = 3   // parallel ffmpeg jobs

// Folder name → label prefix for output filename
const FOLDER_MAP = {
  binky:  'binky',
  yawn:   'yawn',
  groom:  'groom',
  stand:  'stand',
  normal: 'normal',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getDuration(inputPath) {
  // Use ffmpeg itself to read duration (no ffprobe needed)
  return new Promise((resolve) => {
    let output = ''
    execFile(ffmpegInstaller.path, ['-i', inputPath], (_err, _stdout, stderr) => {
      // Duration appears in stderr: "Duration: HH:MM:SS.ss"
      output = stderr || ''
      const match = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
      if (match) {
        const h = parseInt(match[1], 10)
        const m = parseInt(match[2], 10)
        const s = parseFloat(match[3])
        resolve(h * 3600 + m * 60 + s)
      } else {
        resolve(60) // fallback: assume 60s if we can't read it
      }
    })
  })
}

function convertClip(inputPath, outputPath, startTime, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(startTime)
      .outputOptions([
        '-c:v libvpx-vp9',
        '-crf 33',
        '-b:v 0',
        '-an',
        `-t ${duration}`,
        '-deadline realtime',
        '-cpu-used 8',
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      ])
      .format('webm')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath)
  })
}

async function processFile(inputPath, label, index) {
  const duration = await getDuration(inputPath)
  const fileName = path.basename(inputPath)

  console.log(`  [${label}] "${fileName}" — ${duration.toFixed(1)}s`)

  const jobs = []

  if (duration <= CLIP_DURATION + 2) {
    // Short enough — convert as single clip
    const outName = `recording-${label}-src${String(index).padStart(2,'0')}-01.webm`
    const outPath = path.join(RECORDINGS_DIR, outName)
    if (existsSync(outPath)) {
      console.log(`    ↳ skip (already exists): ${outName}`)
      return []
    }
    jobs.push({ inputPath, outputPath: outPath, start: 0, duration: Math.min(duration, CLIP_DURATION), label: outName })
  } else {
    // Split into CLIP_DURATION-second segments
    let clipNum = 1
    for (let start = 0; start < duration - 2; start += CLIP_DURATION) {
      const remaining = duration - start
      if (remaining < 4) break  // skip tiny tail clips
      const clipDur = Math.min(CLIP_DURATION, remaining)
      const outName = `recording-${label}-src${String(index).padStart(2,'0')}-${String(clipNum).padStart(2,'0')}.webm`
      const outPath = path.join(RECORDINGS_DIR, outName)
      if (existsSync(outPath)) {
        console.log(`    ↳ skip (already exists): ${outName}`)
        clipNum++
        continue
      }
      jobs.push({ inputPath, outputPath: outPath, start, duration: clipDur, label: outName })
      clipNum++
    }
  }

  return jobs
}

// ── Run in batches of CONCURRENCY ─────────────────────────────────────────

async function runBatch(jobs) {
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (job) => {
      try {
        await convertClip(job.inputPath, job.outputPath, job.start, job.duration)
        console.log(`    ✓ ${job.label}`)
      } catch (err) {
        console.error(`    ✕ ${job.label} — ${err.message}`)
      }
    }))
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🐇 BunnyCam batch converter\n')

  const allJobs = []

  for (const [folder, label] of Object.entries(FOLDER_MAP)) {
    const folderPath = path.join(RECORDINGS_DIR, folder)
    let files
    try {
      files = await fs.readdir(folderPath)
    } catch {
      continue  // folder doesn't exist, skip
    }

    const videoFiles = files.filter(f => /\.(mp4|mov|avi|mkv|m4v|webm)$/i.test(f))
    if (videoFiles.length === 0) continue

    console.log(`\n📁 ${folder}/ — ${videoFiles.length} file(s)`)

    for (let i = 0; i < videoFiles.length; i++) {
      const inputPath = path.join(folderPath, videoFiles[i])
      const jobs = await processFile(inputPath, label, i + 1)
      allJobs.push(...jobs)
    }
  }

  if (allJobs.length === 0) {
    console.log('\n✅ Nothing to convert — all clips already exist.')
    return
  }

  console.log(`\n⚙️  Converting ${allJobs.length} clip(s) (${CONCURRENCY} at a time)...\n`)
  await runBatch(allJobs)

  console.log('\n✅ Done!')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
