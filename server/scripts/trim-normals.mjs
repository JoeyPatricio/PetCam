/**
 * trim-normals.mjs
 * Trims normal-labeled clips down to 40 by removing labels (not files).
 * Keeps: all 20 rabbitat-normal clips + 20 diverse timestamped recordings.
 * Removes labels from "contaminated" normals (from binky/yawn/groom source videos)
 * and excess timestamp recordings.
 */

import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const LABELS_FILE = path.join(__dirname, '..', 'labels.json')

const raw    = await fs.readFile(LABELS_FILE, 'utf-8')
const labels = JSON.parse(raw)

// ── Normals to always KEEP ─────────────────────────────────────────────────
// All 20 rabbitat clips (diverse outdoor footage)
const KEEP_RABBITAT = Array.from({ length: 20 }, (_, i) =>
  `recording-rabbitat-normal-${String(i + 1).padStart(2, '0')}.webm`
)

// 20 spread-out timestamped live recordings (different hours = different lighting/activity)
const KEEP_TIMESTAMPS = [
  'recording-2026-06-08T21-56-19-308Z.webm',   // evening
  'recording-2026-06-08T23-07-52-174Z.webm',   // night
  'recording-2026-06-09T02-28-41-230Z.webm',   // early AM
  'recording-2026-06-09T03-09-35-405Z.webm',
  'recording-2026-06-09T05-04-05-395Z.webm',
  'recording-2026-06-09T06-08-05-558Z.webm',
  'recording-2026-06-09T06-53-39-660Z.webm',
  'recording-2026-06-09T07-08-41-402Z.webm',
  'recording-2026-06-09T07-53-40-830Z.webm',
  'recording-2026-06-09T08-18-16-036Z.webm',
  'recording-2026-06-09T08-44-25-840Z.webm',
  'recording-2026-06-09T12-43-03-091Z.webm',
  'recording-2026-06-09T12-59-15-010Z.webm',
  'recording-2026-06-09T13-08-38-444Z.webm',
  'recording-2026-06-09T13-21-40-948Z.webm',
  'recording-2026-06-09T13-36-46-430Z.webm',
  'recording-2026-06-09T13-48-13-937Z.webm',
  'recording-2026-06-09T14-10-43-062Z.webm',
  'recording-2026-06-09T14-29-30-228Z.webm',
  'recording-2026-06-09T14-45-53-323Z.webm',   // afternoon
]

const KEEP_SET = new Set([...KEEP_RABBITAT, ...KEEP_TIMESTAMPS])

// ── Process ────────────────────────────────────────────────────────────────
let removed = 0
let kept    = 0

const updated = { ...labels }

for (const [filename, label] of Object.entries(labels)) {
  if (label !== 'normal') continue

  if (KEEP_SET.has(filename)) {
    kept++
  } else {
    delete updated[filename]
    removed++
  }
}

await fs.writeFile(LABELS_FILE, JSON.stringify(updated, null, 2))

console.log(`✅ Done — kept ${kept} normals, removed labels from ${removed} clips`)
console.log(`   Total labels remaining: ${Object.keys(updated).length}`)

// Print new counts
const counts = {}
for (const label of Object.values(updated)) {
  counts[label] = (counts[label] || 0) + 1
}
console.log('\nNew label counts:')
for (const [label, count] of Object.entries(counts).sort()) {
  console.log(`  ${label}: ${count}`)
}
