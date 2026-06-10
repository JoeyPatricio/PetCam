/**
 * trim-normals-v2.mjs
 * Trims normal-labeled clips from 70 → 35.
 * Removes contaminated clips (from binky/groom/yawn source videos)
 * and keeps a spread across all time windows for diversity.
 */

import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const LABELS_FILE = path.join(__dirname, '..', 'labels.json')

const raw    = await fs.readFile(LABELS_FILE, 'utf-8')
const labels = JSON.parse(raw)

// 35 normals to KEEP — diverse time spread across both days, no contaminated clips
const KEEP_SET = new Set([
  // Jun 9 — night (01–03h)
  'recording-2026-06-09T01-09-07-378Z.webm',
  'recording-2026-06-09T02-28-41-230Z.webm',
  'recording-2026-06-09T03-09-35-405Z.webm',

  // Jun 9 — early AM (05h)
  'recording-2026-06-09T05-04-05-395Z.webm',
  'recording-2026-06-09T05-49-53-357Z.webm',

  // Jun 9 — morning (06–08h)
  'recording-2026-06-09T06-08-05-558Z.webm',
  'recording-2026-06-09T06-31-22-066Z.webm',
  'recording-2026-06-09T06-34-08-733Z.webm',
  'recording-2026-06-09T07-08-25-844Z.webm',
  'recording-2026-06-09T07-22-13-822Z.webm',
  'recording-2026-06-09T08-18-16-036Z.webm',
  'recording-2026-06-09T08-28-43-676Z.webm',

  // Jun 9 — midday/afternoon (12–14h)
  'recording-2026-06-09T12-39-22-895Z.webm',
  'recording-2026-06-09T12-59-15-010Z.webm',
  'recording-2026-06-09T13-11-35-776Z.webm',
  'recording-2026-06-09T13-21-40-948Z.webm',
  'recording-2026-06-09T13-32-33-172Z.webm',
  'recording-2026-06-09T13-36-46-430Z.webm',
  'recording-2026-06-09T13-48-13-937Z.webm',
  'recording-2026-06-09T14-10-43-062Z.webm',
  'recording-2026-06-09T14-13-17-216Z.webm',
  'recording-2026-06-09T14-29-30-228Z.webm',

  // Jun 10 — spread across the day
  'recording-2026-06-10T01-23-03-480Z.webm',
  'recording-2026-06-10T02-39-41-064Z.webm',
  'recording-2026-06-10T03-35-55-399Z.webm',
  'recording-2026-06-10T04-20-45-806Z.webm',
  'recording-2026-06-10T05-37-58-493Z.webm',
  'recording-2026-06-10T14-47-50-934Z.webm',
  'recording-2026-06-10T14-54-28-429Z.webm',

  // Rabbitat clips — diverse outdoor footage
  'recording-rabbitat-normal-07.webm',
  'recording-rabbitat-normal-10.webm',
  'recording-rabbitat-normal-14.webm',
  'recording-rabbitat-normal-16.webm',
  'recording-rabbitat-normal-18.webm',
  'recording-rabbitat-normal-19.webm',
])

// Sanity check
console.log(`Keeping ${KEEP_SET.size} normals`)

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

await fs.writeFile(LABELS_FILE, JSON.stringify(updated, null, 2), 'utf-8')

console.log(`✅ Done — kept ${kept} normals, removed labels from ${removed} clips`)
console.log(`   Total labels remaining: ${Object.keys(updated).length}`)

const counts = {}
for (const label of Object.values(updated)) {
  counts[label] = (counts[label] || 0) + 1
}
console.log('\nNew label counts:')
for (const [label, count] of Object.entries(counts).sort()) {
  console.log(`  ${label}: ${count}`)
}
