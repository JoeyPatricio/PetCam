import express from 'express'
import crypto from 'crypto'

const router = express.Router()

// In-memory session tokens (cleared on server restart — fine for personal use)
const sessions = new Set()

const COOKIE_NAME = 'bunnyauth'

function parseCookies(req) {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    })
  )
}

export function isAuthed(req) {
  const token = parseCookies(req)[COOKIE_NAME]
  return !!token && sessions.has(token)
}

/** Middleware: require admin auth for non-GET requests */
export function adminGuard(req, res, next) {
  if (req.method === 'GET' || isAuthed(req)) return next()
  res.status(401).json({ error: 'Login required' })
}

// POST /api/auth/login  { password }
router.post('/login', (req, res) => {
  const { password } = req.body
  const expected = process.env.ADMIN_PASSWORD

  if (!expected) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD not set in server/.env' })
  }
  if (password !== expected) {
    return res.status(401).json({ error: 'Wrong password' })
  }

  const token = crypto.randomBytes(32).toString('hex')
  sessions.add(token)

  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`)
  res.json({ ok: true })
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME]
  if (token) sessions.delete(token)
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`)
  res.json({ ok: true })
})

// GET /api/auth/check
router.get('/check', (req, res) => {
  res.json({ authed: isAuthed(req) })
})

export default router
