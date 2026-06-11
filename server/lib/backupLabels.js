import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const LABELS_FILE = path.join(__dirname, '..', 'labels.json')
const BACKUP_DIR  = path.join(__dirname, '..', 'backups')
const KEEP        = 7 // retain this many daily backups

async function makeBackup() {
  try {
    const raw = await fs.readFile(LABELS_FILE, 'utf-8')
    // Don't snapshot an empty/blank file over a good one
    const obj = JSON.parse(raw.replace(/^﻿/, '').trim() || '{}')
    if (Object.keys(obj).length === 0) return

    await fs.mkdir(BACKUP_DIR, { recursive: true })
    const day  = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const dest = path.join(BACKUP_DIR, `labels-${day}.json`)
    await fs.writeFile(dest, raw, 'utf-8') // one per day; overwrites same-day

    // Prune to the newest KEEP files
    const files = (await fs.readdir(BACKUP_DIR))
      .filter(f => /^labels-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
      await fs.unlink(path.join(BACKUP_DIR, f)).catch(() => {})
    }
  } catch {
    /* missing/corrupt file — skip this cycle */
  }
}

/** Back up now, then once every 24h. */
export function startLabelBackups() {
  makeBackup()
  setInterval(makeBackup, 24 * 60 * 60 * 1000)
}
