import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useWebcam
 * Manages webcam stream lifecycle via getUserMedia.
 *
 * Returns:
 *   videoRef       - attach to <video> element
 *   stream         - raw MediaStream (null if inactive)
 *   isActive       - boolean
 *   error          - string | null
 *   devices        - list of available video input devices
 *   selectedDevice - currently selected deviceId
 *   startCamera    - fn(deviceId?)
 *   stopCamera     - fn()
 *   switchCamera   - fn(deviceId)
 */
export function useWebcam() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [isActive, setIsActive]           = useState(false)
  const [error, setError]                 = useState(null)
  const [devices, setDevices]             = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)

  // Enumerate available cameras
  const refreshDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
      setDevices(videoDevices)
      return videoDevices
    } catch (err) {
      console.error('Could not enumerate devices:', err)
      return []
    }
  }, [])

  const startCamera = useCallback(async (deviceId = null) => {
    setError(null)

    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Refresh device list now that we have permission
      const videoDevices = await refreshDevices()

      // Track which device is active
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      setSelectedDevice(settings.deviceId || (videoDevices[0]?.deviceId ?? null))

      setIsActive(true)
    } catch (err) {
      const messages = {
        NotAllowedError:  'Camera permission denied. Please allow camera access and try again.',
        NotFoundError:    'No camera found. Make sure a webcam is connected.',
        NotReadableError: 'Camera is already in use by another application.',
      }
      setError(messages[err.name] || `Camera error: ${err.message}`)
      setIsActive(false)
    }
  }, [refreshDevices])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsActive(false)
    setSelectedDevice(null)
  }, [])

  const switchCamera = useCallback((deviceId) => {
    startCamera(deviceId)
  }, [startCamera])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  return {
    videoRef,
    stream: streamRef.current,
    isActive,
    error,
    devices,
    selectedDevice,
    startCamera,
    stopCamera,
    switchCamera,
  }
}
