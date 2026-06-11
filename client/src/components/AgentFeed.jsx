import React, { useState, useEffect } from 'react'

const BASE_COLOR = {
  grooming: '#dc82ff', normal: '#88aaff', standing: '#ff9f3c',
  yawn: '#ffd264', zoomies: '#7dff7d',
}
const PHRASE = {
  grooming: 'Bunny is grooming',
  normal:   'Bunny is resting',
  standing: 'Bunny is standing up',
  yawn:     'Bunny is yawning',
  zoomies:  'Bunny has the zoomies',
}

/**
 * AgentFeed
 * Live MJPEG view from the headless camera agent, with the agent's latest
 * prediction overlaid. Replaces the browser-webcam view when the agent runs.
 */
export default function AgentFeed() {
  const [latest, setLatest]     = useState(null) // { label, confidence, time }
  const [recording, setRecording] = useState(false)
  const [flash, setFlash]       = useState('')

  const recordNow = async () => {
    setRecording(true)
    try {
      const res = await fetch('/api/recordings/grab', { method: 'POST' })
      const d   = await res.json()
      setFlash(res.ok ? '✓ Saved clip' : `⚠ ${d.error || 'Failed'}`)
    } catch {
      setFlash('⚠ Failed')
    } finally {
      setRecording(false)
      setTimeout(() => setFlash(''), 2500)
    }
  }

  // Poll the prediction feed for the newest entry
  useEffect(() => {
    const poll = () =>
      fetch('/api/predictions')
        .then(r => r.json())
        .then(d => {
          const ev = (d.events || []).at(-1)
          if (ev) setLatest(ev)
        })
        .catch(() => {})
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  const base = latest ? latest.label.replace('ml_', '') : null

  return (
    <div className="agent-feed">
      <img className="agent-stream" src="/api/stream/live" alt="Live bunny cam (agent)" />

      <div className="agent-badge">
        <span className="agent-dot" />
        AGENT LIVE
      </div>

      <button className="agent-record-btn" onClick={recordNow} disabled={recording} title="Save the last ~12s as a clip">
        <span className="agent-record-dot" />
        {recording ? 'Saving…' : 'Record'}
      </button>

      {flash && <div className="agent-flash">{flash}</div>}

      {latest && (
        <div className="agent-pred" style={{ borderColor: BASE_COLOR[base] }}>
          <span className="agent-pred-label" style={{ color: BASE_COLOR[base] }}>
            {PHRASE[base] ?? base}
          </span>
          <span className="agent-pred-conf">{latest.confidence}%</span>
        </div>
      )}

      <style>{`
        .agent-feed {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: var(--bg-deep);
          border-radius: var(--radius-lg);
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .agent-stream {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .agent-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          background: rgba(15, 13, 10, 0.75);
          backdrop-filter: blur(6px);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 3px 8px;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .agent-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #7dff7d;
          animation: agent-blink 1.4s ease-in-out infinite;
        }
        @keyframes agent-blink { 0%,100%{opacity:1} 50%{opacity:.3} }

        .agent-record-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(15, 13, 10, 0.78);
          backdrop-filter: blur(6px);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 11px;
          color: var(--text-secondary);
          cursor: pointer;
          font-family: var(--font-display);
          letter-spacing: 0.04em;
          transition: all 0.15s;
        }
        .agent-record-btn:hover:not(:disabled) { border-color: var(--red); color: #fff; }
        .agent-record-btn:disabled { opacity: 0.6; cursor: default; }
        .agent-record-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red, #ff4444); }

        .agent-flash {
          position: absolute;
          top: 46px;
          right: 12px;
          background: rgba(15, 13, 10, 0.85);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 4px 10px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .agent-pred {
          position: absolute;
          bottom: 12px;
          left: 12px;
          background: rgba(15, 13, 10, 0.82);
          backdrop-filter: blur(8px);
          border: 1px solid;
          border-radius: 6px;
          padding: 6px 12px;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .agent-pred-label {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .agent-pred-conf {
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }
      `}</style>
    </div>
  )
}
