import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import recordingRoutes from './routes/recordings.js'
import logRoutes from './routes/logs.js'
import labelRoutes from './routes/labels.js'
import importRoutes from './routes/import.js'
import modelRoutes from './routes/model.js'
import smsRoutes from './routes/sms.js'
import authRoutes, { adminGuard } from './routes/auth.js'
import predictionRoutes from './routes/predictions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/recordings', express.static(path.join(__dirname, 'recordings')))

// Auth (public login/logout/check)
app.use('/api/auth', authRoutes)

// Admin guard: GET requests stay public (demo mode reads clips, labels,
// predictions); anything mutating requires login
app.use(['/api/recordings', '/api/labels', '/api/import', '/api/model',
         '/api/sms', '/api/predictions'], adminGuard)

// API routes
app.use('/api/recordings', recordingRoutes)
app.use('/api/logs', logRoutes)
app.use('/api/labels', labelRoutes)
app.use('/api/import', importRoutes)
app.use('/api/model', modelRoutes)
app.use('/api/sms', smsRoutes)
app.use('/api/predictions', predictionRoutes)

// Serve trained model weights
app.use('/model', express.static(path.join(__dirname, 'model')))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.listen(PORT, () => {
  console.log(`🐇 BunnyCam server running at http://localhost:${PORT}`)
})
