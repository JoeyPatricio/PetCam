/**
 * PM2 process definitions for BunnyCam.
 * Start everything with:  pm2 start ecosystem.config.cjs
 * This declarative list is the source of truth — more reliable than pm2 save.
 */
const path = require('path')
const SERVER = path.join(__dirname, 'server')

// cloudflared location (Windows install path). Override with CLOUDFLARED_PATH.
const CLOUDFLARED = process.env.CLOUDFLARED_PATH ||
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'

module.exports = {
  apps: [
    {
      name: 'bunnycam-server',
      script: 'index.js',
      cwd: SERVER,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'bunnycam-agent',
      script: 'agent/capture.mjs',
      cwd: SERVER,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
    },
    {
      name: 'bunnycam-tunnel',
      script: CLOUDFLARED,
      args: 'tunnel run bunnycam',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
  ],
}
