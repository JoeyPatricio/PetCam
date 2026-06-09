import React, { useState } from 'react'

/**
 * Controls
 * Camera controls: start/stop, record, motion toggle, sensitivity, device selector.
 */
export default function Controls({
  isActive,
  motionEnabled,
  isRecording,
  autoRecordEnabled,
  motionLevel,
  sensitivity,
  devices,
  selectedDevice,
  onStart,
  onStop,
  onRecord,
  onToggleAutoRecord,
  onToggleMotion,
  onSensitivityChange,
  onSwitchCamera,
}) {
  const [recording, setRecording] = useState(false)

  const handleRecord = async () => {
    setRecording(true)
    await onRecord()
    setTimeout(() => setRecording(false), 300)
  }

  return (
    <div className="controls">
      {/* Primary actions */}
      <div className="controls-row">
        <button
          className={`btn btn-primary ${isActive ? 'btn-danger' : ''}`}
          onClick={isActive ? onStop : onStart}
        >
          {isActive ? '⏹ Stop' : '▶ Start Camera'}
        </button>

        <button
          className={`btn btn-secondary ${recording ? 'btn-danger' : ''}`}
          onClick={handleRecord}
          disabled={!isActive || recording}
          title="Record a short clip"
        >
          {recording ? '● Recording' : '⏺ Record'}
        </button>

        <button
          className={`btn btn-secondary ${autoRecordEnabled ? 'btn-active' : ''}`}
          onClick={onToggleAutoRecord}
          disabled={!isActive}
          title={autoRecordEnabled ? 'Disable auto record on motion' : 'Enable auto record on motion'}
        >
          {autoRecordEnabled ? '🟢 Auto record' : '⭘ Auto record'}
        </button>

        <button
          className={`btn btn-secondary ${motionEnabled ? 'btn-active' : ''}`}
          onClick={onToggleMotion}
          disabled={!isActive}
          title={motionEnabled ? 'Disable motion detection' : 'Enable motion detection'}
        >
          {motionEnabled ? '👁 Motion On' : '👁 Motion Off'}
        </button>

      </div>

      {/* Motion level bar */}
      {isActive && motionEnabled && (
        <div className="motion-bar-row">
          <span className="label">Motion</span>
          <div className="motion-bar-track">
            <div
              className="motion-bar-fill"
              style={{ width: `${Math.min(100, motionLevel)}%` }}
            />
          </div>
          <span className="motion-val">{motionLevel}%</span>
        </div>
      )}

      {/* Sensitivity */}
      {isActive && motionEnabled && (
        <div className="slider-row">
          <label htmlFor="sensitivity" className="label">Sensitivity</label>
          <input
            id="sensitivity"
            type="range"
            min="1"
            max="100"
            value={sensitivity}
            onChange={e => onSensitivityChange(Number(e.target.value))}
            className="slider"
          />
          <span className="slider-val">{sensitivity}</span>
        </div>
      )}

      {/* Camera selector */}
      {devices.length > 1 && (
        <div className="select-row">
          <label htmlFor="camera-select" className="label">Camera</label>
          <select
            id="camera-select"
            className="select"
            value={selectedDevice || ''}
            onChange={e => onSwitchCamera(e.target.value)}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <style>{`
        .controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .controls-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 8px 14px;
          border-radius: var(--radius);
          font-size: 12px;
          font-family: var(--font-mono);
          font-weight: 500;
          letter-spacing: 0.04em;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }

        .btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .btn-primary {
          background: var(--accent);
          color: var(--bg-deep);
          border-color: var(--accent);
        }

        .btn-primary:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 85%, white);
        }

        .btn-danger {
          background: var(--red-dim);
          color: var(--red);
          border-color: var(--red-dim);
        }

        .btn-danger:hover:not(:disabled) {
          background: color-mix(in srgb, var(--red-dim) 70%, var(--red));
        }

        .btn-secondary {
          background: var(--bg-card);
          color: var(--text-secondary);
          border-color: var(--border);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border-color: var(--border-light);
        }

        .btn-active {
          border-color: var(--accent-soft);
          color: var(--accent);
        }


        /* Motion bar */
        .motion-bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .motion-bar-track {
          flex: 1;
          height: 4px;
          background: var(--bg-card);
          border-radius: 2px;
          overflow: hidden;
        }

        .motion-bar-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.1s ease;
        }

        .motion-val {
          color: var(--text-muted);
          font-size: 11px;
          width: 32px;
          text-align: right;
        }

        /* Slider */
        .slider-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .slider {
          flex: 1;
          accent-color: var(--accent);
          cursor: pointer;
        }

        .slider-val {
          color: var(--text-muted);
          font-size: 11px;
          width: 24px;
          text-align: right;
        }

        /* Select */
        .select-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .select {
          flex: 1;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 6px 10px;
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
        }

        .select:focus {
          outline: 1px solid var(--accent-soft);
        }

        .label {
          color: var(--text-muted);
          font-size: 11px;
          letter-spacing: 0.08em;
          white-space: nowrap;
          min-width: 70px;
        }
      `}</style>
    </div>
  )
}
