'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface CropModalProps {
  image: HTMLImageElement
  title: string
  onConfirm: (dataURL: string) => void
  onClose: () => void
}

const CNIC_RATIO = 85.6 / 54

export default function CropModal({ image, title, onConfirm, onClose }: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null)
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [displayScale, setDisplayScale] = useState(1)
  const [rotation, setRotation] = useState(0) // Rotation state in degrees

  const draw = useCallback(
    (start: typeof cropStart, end: typeof cropEnd) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!

      // Scaled dimensions of the original image
      const scaledOrigW = image.width * displayScale
      const scaledOrigH = image.height * displayScale

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 1. Draw base rotated image
      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(image, -scaledOrigW / 2, -scaledOrigH / 2, scaledOrigW, scaledOrigH)
      ctx.restore()

      if (start && end) {
        const x = Math.min(start.x, end.x)
        const y = Math.min(start.y, end.y)
        const w = Math.abs(end.x - start.x)
        const h = Math.abs(end.y - start.y)

        // 2. Draw dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // 3. Clip the selected area and re-draw the bright rotated image inside it
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, w, h)
        ctx.clip()

        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((rotation * Math.PI) / 180)
        ctx.drawImage(image, -scaledOrigW / 2, -scaledOrigH / 2, scaledOrigW, scaledOrigH)
        ctx.restore()

        // 4. Draw crop borders & handles
        ctx.strokeStyle = '#00c896'
        ctx.lineWidth = 1.5
        ctx.strokeRect(x, y, w, h)
        ;[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
          ctx.fillStyle = '#00c896'
          ctx.fillRect(cx - 5, cy - 5, 10, 10)
        })
        ctx.font = '11px IBM Plex Mono, monospace'
        ctx.fillStyle = '#00c896'
        ctx.fillText(`${Math.round(w / displayScale)} × ${Math.round(h / displayScale)}px`, x + 4, y - 6)
      }
    },
    [image, displayScale, rotation]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // Adjust dimensions based on rotation
    const isRotated = rotation === 90 || rotation === 270
    const imgW = isRotated ? image.height : image.width
    const imgH = isRotated ? image.width : image.height

    const maxW = Math.min(500, window.innerWidth * 0.82)
    const scale = maxW / imgW
    setDisplayScale(scale)
    
    canvas.width = Math.round(imgW * scale)
    canvas.height = Math.round(imgH * scale)
    
    // Reset crop area whenever rotation changes
    setCropStart(null)
    setCropEnd(null)
  }, [image, rotation])

  useEffect(() => {
    draw(cropStart, cropEnd)
  }, [cropStart, cropEnd, draw])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    const sx = canvas.width / r.width
    const sy = canvas.height / r.height
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy }
  }

  const autoDetect = () => {
    const canvas = canvasRef.current!
    const cnicW = canvas.width * 0.9
    const cnicH = cnicW / CNIC_RATIO
    const cx = (canvas.width - cnicW) / 2
    const cy = (canvas.height - cnicH) / 2
    setCropStart({ x: cx, y: cy })
    setCropEnd({ x: cx + cnicW, y: cy + cnicH })
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const confirmCrop = () => {
    const isRotated = rotation === 90 || rotation === 270
    const imgW = isRotated ? image.height : image.width
    const imgH = isRotated ? image.width : image.height

    // 1. Create a temporary canvas to hold the FULL RESOLUTION rotated image
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = imgW
    tempCanvas.height = imgH
    const tempCtx = tempCanvas.getContext('2d')!

    tempCtx.translate(imgW / 2, imgH / 2)
    tempCtx.rotate((rotation * Math.PI) / 180)
    tempCtx.drawImage(image, -image.width / 2, -image.height / 2)

    // 2. Draw the final cropped version from the temp canvas
    const finalCanvas = document.createElement('canvas')
    const finalCtx = finalCanvas.getContext('2d')!

    if (cropStart && cropEnd) {
      const x = Math.min(cropStart.x, cropEnd.x) / displayScale
      const y = Math.min(cropStart.y, cropEnd.y) / displayScale
      const w = Math.abs(cropEnd.x - cropStart.x) / displayScale
      const h = Math.abs(cropEnd.y - cropStart.y) / displayScale
      
      finalCanvas.width = Math.round(w)
      finalCanvas.height = Math.round(h)
      finalCtx.drawImage(tempCanvas, x, y, w, h, 0, 0, finalCanvas.width, finalCanvas.height)
    } else {
      finalCanvas.width = imgW
      finalCanvas.height = imgH
      finalCtx.drawImage(tempCanvas, 0, 0)
    }

    onConfirm(finalCanvas.toDataURL('image/jpeg', 0.95))
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg2)', border: '0.5px solid var(--border2)',
        borderRadius: 12, padding: '1.25rem', maxWidth: 560, width: '93vw',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          Drag to select CNIC area — ya Auto Detect use karo
        </p>
        <div style={{ background: '#050708', borderRadius: 8, overflow: 'hidden', marginBottom: 12, border: '0.5px solid var(--border)' }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', cursor: 'crosshair' }}
            onMouseDown={(e) => { setIsDragging(true); setCropStart(getPos(e)); setCropEnd(null) }}
            onMouseMove={(e) => { if (isDragging) setCropEnd(getPos(e)) }}
            onMouseUp={(e) => { setIsDragging(false); setCropEnd(getPos(e)) }}
            onMouseLeave={() => { if (isDragging) setIsDragging(false) }}
            onTouchStart={(e) => { e.preventDefault(); setIsDragging(true); setCropStart(getPos(e)); setCropEnd(null) }}
            onTouchMove={(e) => { e.preventDefault(); if (isDragging) setCropEnd(getPos(e)) }}
            onTouchEnd={() => { setIsDragging(false) }}
          />
        </div>
        
        {/* Buttons Row with new Rotate Button */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={handleRotate}>↻ Rotate</button>
          <button className="btn-outline" onClick={autoDetect}>⊡ Auto Detect</button>
          <button className="btn-outline" onClick={() => { setCropStart(null); setCropEnd(null) }}>↺ Reset</button>
          <button className="btn-green" style={{ flex: 1, minWidth: 120 }} onClick={confirmCrop}>✓ Apply Crop</button>
        </div>
        
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
          <button className="btn-outline" style={{ width: '100%', border: 'none', color: 'var(--text2)' }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}