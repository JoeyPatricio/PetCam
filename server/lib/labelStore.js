import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const LABELS_FILE = path.join(__dirname, '..', 'labels.json')
const TMP_FILE    = LABELS_FILE + '.tmp'
const BAK_FILE    = LABELS_FILE + '.bak'

// Serialize all read-modify-write operations so two requests can never
// interleave and clobber each other.
let queue = Promise.resolve()

/**
 * Read labels. Returns {} ONLY when the file legitimately doesn't exist.
 * On a parse error (e.g. a mid-write partial read or corruption) this THROWS,
 * so callers abort instead of overwriting good data with an empty object.
 */
export async function readLabels() {
  let raw
  try {
    raw = await fs.readFile(LABELS_FILE, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw err
  }
  const text = raw.replace(/^﻿/, '').trim() // strip BOM/whitespace
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`labels.json is corrupt — refusing to overwrite: ${err.message}`)
  }
}

/** Atomic write: write a temp file, then rename over the real one. */
async function writeAtomic(obj) {
  const json = JSON.stringify(obj, null, 2)
  await fs.writeFile(TMP_FILE, json, 'utf-8')
  await fs.rename(TMP_FILE, LABELS_FILE)
}

/**
 * Run a read-modify-write transaction safely and serially.
 * `mutate(labels)` receives a copy, returns the new labels object.
 * Keeps a .bak of the previous good state before each write.
 */
export function updateLabels(mutate) {
  queue = queue.then(async () => {
    const current = await readLabels()
    const next    = mutate({ ...current })
    // Safety net: never silently wipe a populated file down to empty.
    if (Object.keys(current).length > 5 && Object.keys(next).length === 0) {
      throw new Error('Refusing to clear all labels in one operation')
    }
    await fs.copyFile(LABELS_FILE, BAK_FILE).catch(() => {}) // best-effort backup
    await writeAtomic(next)
    return next
  })
  // Make sure a failed transaction doesn't poison the queue for the next caller
  const result = queue
  queue = queue.catch(() => {})
  return result
}
