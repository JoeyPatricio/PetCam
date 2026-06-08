import React from 'react'

/**
 * VideoFeed
 * Renders the live webcam video with motion detection overlay and optional
 * night-vision canvas on top (green-tinted brightness-boosted frames).
 */
export default function VideoFeed({
  videoRef,
  overlayCanvasRef,
  nightVisionCanvasRef,
  nightVisionActive,
  isActive,
  isMotion,
  error,
}) {
  return (
    <div className="video-feed-wrapper">
      {/* Motion indicator ring */}
      {isMotion && <div className="motion-ring" aria-hidden="true" />}

      {/* Raw camera feed — hidden under NV canvas when night vision is on */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`video-element ${isActive ? 'active' : ''} ${nightVisionActive ? 'nv-hidden' : ''}`}
        aria-label="Live bunny cam feed"
      />

      {/* Night vision processed canvas — sits between video and motion overlay */}
      <canvas
        ref={nightVisionCanvasRef}
        className={`nv-canvas ${nightVisionActive ? 'nv-canvas-active' : ''}`}
        aria-hidden="true"
      />

      {/* Motion highlight overlay */}
      <canvas
        ref={overlayCanvasRef}
        className="motion-overlay"
        aria-hidden="true"
      />

      {/* Idle / error state */}
      {!isActive && !error && (
        <div className="feed-placeholder">
          <span className="placeholder-emoji">🐇</span>
          <p className="placeholder-text">Camera is off</p>
          <p className="placeholder-sub">Press Start to begin watching</p>
        </div>
      )}

      {error && (
        <div className="feed-placeholder feed-error">
          <span className="placeholder-emoji">⚠️</span>
          <p className="placeholder-text">Camera error</p>
          <p className="placeholder-sub">{error}</p>
        </div>
      )}

      {/* Badges */}
      {isActive && (
        <div className="badge-row">
          <div className="live-badge" aria-label="Live">
            <span className="live-dot" />
            LIVE
          </div>
          {nightVisionActive && (
            <div className="nv-badge" aria-label="Night vision active">
              <span className="nv-dot" />
              NV
            </div>
          )}
        </div>
      )}

      <style>{`
        .video-feed-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: var(--bg-deep);
          border-radius: var(--radius-lg);
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .motion-ring {
          position: absolute;
          inset: 0;
          border-radius: var(--radius-lg);
          box-shadow: inset 0 0 0 3px var(--accent);
          animation: ring-pulse 1s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
        }

        @keyframes ring-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        .video-element {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          opacity: 0;
          transition: opacity 0.4s ease;
        }

        .video-element.active {
          opacity: 1;
        }

        /* When NV is on, hide raw video so the processed canvas shows instead */
        .video-element.nv-hidden {
          opacity: 0 !important;
        }

        .nv-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 4;
          opacity: 0;
          transition: opacity 0.5s ease;
          object-fit: cover;
        }

        .nv-canvas-active {
          opacity: 1;
        }

        .motion-overlay {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 5;
          mix-blend-mode: screen;
        }

        .feed-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: var(--bg-deep);
        }

        .feed-error { background: color-mix(in srgb, var(--red-dim) 20%, var(--bg-deep)); }

        .placeholder-emoji { font-size: 48px; }
        .placeholder-text  { color: var(--text-secondary); font-family: var(--font-display); font-size: 18px; }
        .placeholder-sub   { color: var(--text-muted); font-size: 12px; }

        .badge-row {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          gap: 6px;
          z-index: 8;
        }

        .live-badge,
        .nv-badge {
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

        .nv-badge {
          color: #7dff7d;
          border-color: rgba(125, 255, 125, 0.3);
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--red);
          animation: blink 1.4s ease-in-out infinite;
        }

        .nv-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #7dff7d;
          animation: blink 2s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
