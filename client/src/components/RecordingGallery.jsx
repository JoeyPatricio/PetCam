import React, { useState, useEffect, useCallback } from 'react'

export default function RecordingGallery({ refreshTrigger }) {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchRecordings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recordings')
      const data = await res.json()
      setRecordings(data.recordings || [])
    } catch (err) {
      console.error('Failed to load recordings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecordings()
  }, [fetchRecordings, refreshTrigger])

  const deleteRecording = async (filename) => {
    try {
      await fetch(`/api/recordings/${filename}`, { method: 'DELETE' })
      setRecordings(prev => prev.filter(r => r.filename !== filename))
    } catch (err) {
      console.error('Failed to delete recording:', err)
    }
  }

  const formatDate = (isoStr) => {
    const d = new Date(isoStr)
    return d.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="recordings">
      <div className="recordings-header">
        <span className="recordings-title">Recordings</span>
        <span className="recordings-count">{recordings.length} saved</span>
      </div>

      {loading && <div className="recordings-loading">Loading…</div>}

      {!loading && recordings.length === 0 && (
        <div className="recordings-empty">
          <span>🎥</span>
          <span>No recordings yet. Enable auto record or hit record.</span>
        </div>
      )}

      <div className="recordings-grid">
        {recordings.map(recording => (
          <div
            key={recording.filename}
            className="recording-item"
          >
            <div className="recording-thumb">
              <video
                controls
                muted
                preload="none"
                src={`/recordings/${recording.filename}`}
              />
            </div>

            <div className="recording-meta">
              <span className="recording-time">{formatDate(recording.createdAt)}</span>
              <button
                className="delete-btn"
                onClick={() => deleteRecording(recording.filename)}
                title="Delete recording"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .recordings {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .recordings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }

        .recordings-title {
          font-family: var(--font-display);
          font-size: 13px;
          color: var(--text-secondary);
        }

        .recordings-count {
          color: var(--text-muted);
          font-size: 11px;
        }

        .recordings-loading,
        .recordings-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 32px;
          color: var(--text-muted);
          font-size: 12px;
        }

        .recordings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px;
          padding: 12px;
          max-height: 360px;
          overflow-y: auto;
        }

        .recording-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .recording-thumb {
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 0;
          background: transparent;
          cursor: pointer;
          overflow: hidden;
        }

        .recording-thumb video {
          width: 100%;
          aspect-ratio: 16 / 9;
          display: block;
          object-fit: cover;
        }

        .recording-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
        }

        .recording-time {
          color: var(--text-muted);
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .delete-btn {
          background: none;
          color: var(--text-muted);
          font-size: 10px;
          padding: 1px 3px;
          border-radius: 2px;
          flex-shrink: 0;
          transition: color 0.15s;
        }

        .delete-btn:hover {
          color: var(--red);
        }
      `}</style>
    </div>
  )
}
