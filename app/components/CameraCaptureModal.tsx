'use client'
import { useEffect, useRef, useState } from 'react'

interface CameraCaptureModalProps {
  side: 'front' | 'back'
  onCapture: (dataUrl: string) => void
  onClose: () => void
}

export default function CameraCaptureModal({ side, onCapture, onClose }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const start = async () => {
      setStatus('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setStatus('ready')
      } catch {
        setStatus('error')
        setErrorText('Camera access nahi mili. Browser permission allow karein ya image upload use karein.')
      }
    }

    start()

    return () => {
      document.body.style.overflow = prev
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const captureFrame = () => {
    const video = videoRef.current
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)

    onCapture(canvas.toDataURL('image/jpeg', 0.98))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#02060d', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ color: '#00e5a0', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono,monospace)' }}>
          Camera Scan - {side === 'front' ? 'Front' : 'Back'}
        </div>
        <button className="btn-outline" onClick={onClose} style={{ padding: '6px 10px' }}>Close</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'grid', placeItems: 'center' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.44)' }} />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '84vw',
              maxWidth: 620,
              aspectRatio: '85.6 / 54',
              transform: 'translate(-50%, -50%)',
              border: '2px dashed #00e5a0',
              borderRadius: 14,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
            }}
          />
          <div style={{ position: 'absolute', left: '50%', top: 'calc(50% + min(34vw, 250px))', transform: 'translateX(-50%)', color: '#cce7df', fontSize: 12, fontFamily: 'var(--font-mono,monospace)' }}>
            CNIC ko frame ke andar align karein
          </div>
        </div>

        {status === 'starting' && <div style={{ position: 'absolute', top: 12, left: 12, color: '#dbe6e2' }}>Starting camera...</div>}
        {status === 'error' && <div style={{ position: 'absolute', top: 12, left: 12, right: 12, color: '#ffb3b3' }}>{errorText}</div>}
      </div>

      <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button className="btn-outline" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
        <button className="btn-green" disabled={status !== 'ready'} onClick={captureFrame} style={{ flex: 2 }}>
          Capture + Auto Straighten
        </button>
      </div>
    </div>
  )
}
