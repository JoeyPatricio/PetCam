import React, { useEffect, useRef } from 'react'

/**
 * ActivityLog
 * Scrollable list of timestamped motion detection events.
 */
export default function ActivityLog({ events, onClear }) {
  const bottomRef = useRef(null)

  // Auto-scroll to latest entry
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="activity-log">
      <div className="log-header">
        <span className="log-title">Activity Log</span>
        {events.length > 0 && (
          <button className="clear-btn" onClick={onClear} title="Clear log">
            Clear
          </button>
        )}
      </div>

      <div className="log-body">
        {events.length === 0 ? (
          <div className="log-empty">
            <span className="empty-icon">🌿</span>
            <span>No motion detected yet</span>
          </div>
        ) : (
          <>
            {events.map((event) => (
              <div key={event.id} className={`log-entry${event.type === 'prediction' ? ' log-entry-prediction' : ''}`}>
                <span className="entry-time">{formatTime(event.timestamp)}</span>
                <span
                  className={`entry-dot${event.color ? ' colored' : ''}`}
                  style={event.color ? { background: event.color } : {}}
                />
                <span className="entry-msg" style={event.color ? { color: event.color } : {}}>
                  {event.message}
                </span>
                {event.confidence !== undefined && (
                  <span className="entry-level">{event.confidence}%</span>
                )}
                {event.level !== undefined && (
                  <span className="entry-level">{event.level}%</span>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <style>{`
        .activity-log {
          display: flex;
          flex-direction: column;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          height: 100%;
          min-height: 200px;
          max-height: 340px;
        }

        .log-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }

        .log-title {
          font-family: var(--font-display);
          font-size: 13px;
          color: var(--text-secondary);
          letter-spacing: 0.04em;
        }

        .clear-btn {
          background: none;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 3px;
          border: 1px solid var(--border);
          transition: all 0.15s;
        }

        .clear-btn:hover {
          color: var(--text-secondary);
          border-color: var(--border-light);
        }

        .log-body {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .log-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 100%;
          color: var(--text-muted);
          font-size: 12px;
          padding: 32px;
        }

        .empty-icon { font-size: 24px; }

        .log-entry {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
          transition: background 0.1s;
        }

        .log-entry:hover {
          background: var(--bg-card-hover);
        }

        .log-entry:last-of-type {
          border-bottom: none;
        }

        .entry-time {
          color: var(--text-muted);
          font-size: 10px;
          white-space: nowrap;
          min-width: 72px;
        }

        .entry-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }

        .entry-dot.colored {
          width: 6px;
          height: 6px;
        }

        .entry-msg {
          flex: 1;
          color: var(--text-secondary);
          font-size: 11px;
        }

        .entry-level {
          color: var(--text-muted);
          font-size: 10px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}
