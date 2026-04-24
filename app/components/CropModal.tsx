'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface Point { x: number; y: number }
interface CropModalProps {
  image: HTMLImageElement
  title: string
  onConfirm: (dataURL: string) => void
  onClose: () => void
}

const CNIC_RATIO = 85.6 / 54
const A4_RATIO = 297 / 210

type FilterType = 'original' | 'bw' | 'enhanced' | 'magic' | 'grayscale' | 'vivid'
type ModeType = 'crop' | 'scan'

const FILTERS: { id: FilterType; label: string; icon: string }[] = [
  { id: 'original', label: 'Original', icon: '🎨' },
  { id: 'magic',    label: 'Magic',    icon: '✨' },
  { id: 'enhanced', label: 'Enhance',  icon: '⚡' },
  { id: 'bw',       label: 'B&W',      icon: '◑' },
  { id: 'grayscale',label: 'Gray',     icon: '▦' },
  { id: 'vivid',    label: 'Vivid',    icon: '🌈' },
]

// Apply CSS-style filters via canvas pixel manipulation
function applyFilter(ctx: CanvasRenderingContext2D, w: number, h: number, filter: FilterType) {
  if (filter === 'original') return
  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2]
    if (filter === 'bw') {
      // High contrast B&W (document scan style)
      const avg = 0.299*r + 0.587*g + 0.114*b
      const thresh = avg > 128 ? 255 : 0
      d[i] = d[i+1] = d[i+2] = thresh
    } else if (filter === 'grayscale') {
      const avg = 0.299*r + 0.587*g + 0.114*b
      d[i] = d[i+1] = d[i+2] = avg
    } else if (filter === 'enhanced') {
      // Boost contrast + reduce background noise (like MS Lens "Document")
      const avg = 0.299*r + 0.587*g + 0.114*b
      const contrast = 1.6
      const brightness = 20
      const nr = Math.min(255, Math.max(0, (r - 128) * contrast + 128 + brightness))
      const ng = Math.min(255, Math.max(0, (g - 128) * contrast + 128 + brightness))
      const nb = Math.min(255, Math.max(0, (b - 128) * contrast + 128 + brightness))
      d[i] = nr; d[i+1] = ng; d[i+2] = nb
    } else if (filter === 'magic') {
      // "Magic Color" — whiten background, keep ink dark (like CamScanner magic)
      const gray = 0.299*r + 0.587*g + 0.114*b
      // Whiten light pixels, deepen dark pixels
      const t = gray > 160 ? Math.min(255, gray * 1.25) : gray * 0.55
      const satBoost = gray < 160 ? 1.4 : 0.2
      const rr = t + (r - gray) * satBoost
      const gg = t + (g - gray) * satBoost
      const bb = t + (b - gray) * satBoost
      d[i]   = Math.min(255, Math.max(0, rr))
      d[i+1] = Math.min(255, Math.max(0, gg))
      d[i+2] = Math.min(255, Math.max(0, bb))
    } else if (filter === 'vivid') {
      // Boost saturation
      const gray = 0.299*r + 0.587*g + 0.114*b
      const s = 1.8
      d[i]   = Math.min(255, Math.max(0, gray + (r - gray) * s))
      d[i+1] = Math.min(255, Math.max(0, gray + (g - gray) * s))
      d[i+2] = Math.min(255, Math.max(0, gray + (b - gray) * s))
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

function solveLinearSystem8(a: number[][], b: number[]): number[] | null {
  const n = 8
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null
    if (pivot !== col) {
      const tmp = m[col]
      m[col] = m[pivot]
      m[pivot] = tmp
    }

    const div = m[col][col]
    for (let c = col; c <= n; c++) m[col][c] /= div

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = m[r][col]
      for (let c = col; c <= n; c++) {
        m[r][c] -= factor * m[col][c]
      }
    }
  }

  return m.map(row => row[n])
}

function computeHomographyDestToSrc(corners: Point[], dstW: number, dstH: number): number[] | null {
  const dest = [
    { u: 0, v: 0 },
    { u: dstW, v: 0 },
    { u: dstW, v: dstH },
    { u: 0, v: dstH },
  ]

  const A: number[][] = []
  const B: number[] = []

  for (let i = 0; i < 4; i++) {
    const { u, v } = dest[i]
    const { x, y } = corners[i]

    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    B.push(x)

    A.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    B.push(y)
  }

  return solveLinearSystem8(A, B)
}

function sampleBilinear(src: Uint8ClampedArray, srcW: number, srcH: number, x: number, y: number): [number, number, number, number] {
  const cx = Math.max(0, Math.min(srcW - 1.001, x))
  const cy = Math.max(0, Math.min(srcH - 1.001, y))

  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(srcW - 1, x0 + 1)
  const y1 = Math.min(srcH - 1, y0 + 1)

  const fx = cx - x0
  const fy = cy - y0

  const i00 = (y0 * srcW + x0) * 4
  const i10 = (y0 * srcW + x1) * 4
  const i01 = (y1 * srcW + x0) * 4
  const i11 = (y1 * srcW + x1) * 4

  const w00 = (1 - fx) * (1 - fy)
  const w10 = fx * (1 - fy)
  const w01 = (1 - fx) * fy
  const w11 = fx * fy

  const r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11
  const g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11
  const b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11
  const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11

  return [r, g, b, a]
}

// Accurate perspective transform: maps src quad → destination rectangle.
function perspectiveTransform(
  src: CanvasImageSource,
  srcW: number, srcH: number,
  corners: Point[],
  dstW: number, dstH: number
): HTMLCanvasElement {
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = srcW
  srcCanvas.height = srcH
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.drawImage(src, 0, 0, srcW, srcH)

  const srcImg = srcCtx.getImageData(0, 0, srcW, srcH)
  const srcData = srcImg.data

  const out = document.createElement('canvas')
  out.width = Math.max(1, dstW)
  out.height = Math.max(1, dstH)
  const outCtx = out.getContext('2d')!
  const outImg = outCtx.createImageData(out.width, out.height)
  const outData = outImg.data

  const h = computeHomographyDestToSrc(corners, out.width - 1, out.height - 1)
  if (!h) return out

  const [a, b, c, d, e, f, g, hh] = h
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const denom = g * x + hh * y + 1
      const sx = (a * x + b * y + c) / denom
      const sy = (d * x + e * y + f) / denom
      const [r, gg, bb, aa] = sampleBilinear(srcData, srcW, srcH, sx, sy)
      const i = (y * out.width + x) * 4
      outData[i] = r
      outData[i + 1] = gg
      outData[i + 2] = bb
      outData[i + 3] = aa
    }
  }

  outCtx.putImageData(outImg, 0, 0)
  return out
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)))
  return sorted[idx]
}

function detectDocumentCorners(source: HTMLCanvasElement): Point[] | null {
  const maxSide = 520
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  const w = Math.max(64, Math.round(source.width * scale))
  const h = Math.max(64, Math.round(source.height * scale))

  const work = document.createElement('canvas')
  work.width = w
  work.height = h
  const ctx = work.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h).data
  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  const mag = new Float32Array(w * h)
  const mags: number[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1]
        + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1]
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
        + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1]
      const m = Math.hypot(gx, gy)
      mag[i] = m
      mags.push(m)
    }
  }

  const threshold = percentile(mags, 0.9)
  const edgePoints: Point[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mag[i] >= threshold) edgePoints.push({ x, y })
    }
  }

  if (edgePoints.length < 200) return null

  const marginX = Math.round(w * 0.03)
  const marginY = Math.round(h * 0.03)
  const outer = edgePoints.filter(p => p.x <= marginX || p.x >= w - marginX || p.y <= marginY || p.y >= h - marginY)
  const pts = outer.length > 40 ? outer : edgePoints

  let tl = pts[0]
  let tr = pts[0]
  let br = pts[0]
  let bl = pts[0]

  for (const p of pts) {
    const sum = p.x + p.y
    const diff = p.x - p.y
    const tlSum = tl.x + tl.y
    const brSum = br.x + br.y
    const trDiff = tr.x - tr.y
    const blDiff = bl.x - bl.y
    if (sum < tlSum) tl = p
    if (sum > brSum) br = p
    if (diff > trDiff) tr = p
    if (diff < blDiff) bl = p
  }

  const corners = [tl, tr, br, bl].map(p => ({ x: p.x / scale, y: p.y / scale }))
  return corners
}

export default function CropModal({ image, title, onConfirm, onClose }: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasViewportRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<ModeType>('crop')
  const [cropStart, setCropStart] = useState<Point | null>(null)
  const [cropEnd, setCropEnd]     = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fitScale, setFitScale] = useState(1)
  const [displayScale, setDisplayScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation]   = useState(0)
  const [filter, setFilter]       = useState<FilterType>('original')
  const [aspectLock, setAspectLock] = useState<'free'|'cnic'|'a4'|'square'>('free')
  const [showGrid, setShowGrid]   = useState(true)
  const [brightness, setBrightness] = useState(0)   // -100 to 100
  const [contrast, setContrast]   = useState(0)     // -100 to 100

  // Scan mode: 4 draggable corner handles
  const [corners, setCorners] = useState<Point[]>([])  // TL TR BR BL in canvas coords
  const [dragCorner, setDragCorner] = useState<number | null>(null)

  const getRotatedDims = useCallback(() => {
    const isRot = rotation === 90 || rotation === 270
    return { w: isRot ? image.height : image.width, h: isRot ? image.width : image.height }
  }, [image, rotation])

  // Initialize canvas & corners
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const { w: imgW, h: imgH } = getRotatedDims()
    const maxW = Math.min(520, window.innerWidth * 0.85)
    const scale = maxW / imgW
    const finalScale = scale * zoom
    setFitScale(scale)
    setDisplayScale(finalScale)
    canvas.width  = Math.round(imgW * finalScale)
    canvas.height = Math.round(imgH * finalScale)
    setCropStart(null); setCropEnd(null)
    // Default corners at 10% inset
    const pad = 0.1
    setCorners([
      { x: canvas.width * pad,        y: canvas.height * pad },
      { x: canvas.width * (1-pad),    y: canvas.height * pad },
      { x: canvas.width * (1-pad),    y: canvas.height * (1-pad) },
      { x: canvas.width * pad,        y: canvas.height * (1-pad) },
    ])
  }, [image, rotation, getRotatedDims, zoom])

  const buildLivePreview = useCallback(() => {
    const src = document.createElement('canvas')
    src.width = image.width
    src.height = image.height
    const srcCtx = src.getContext('2d')!
    srcCtx.filter = `brightness(${1 + brightness/100}) contrast(${1 + contrast/100})`
    srcCtx.drawImage(image, 0, 0)
    srcCtx.filter = 'none'
    if (filter !== 'original') applyFilter(srcCtx, src.width, src.height, filter)
    return src
  }, [image, brightness, contrast, filter])

  // ─── Main Draw ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { w: imgW, h: imgH } = getRotatedDims()
    const sw = imgW * displayScale, sh = imgH * displayScale
    const livePreview = buildLivePreview()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw rotated image
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(livePreview, -sw/2, -sh/2, sw, sh)
    ctx.restore()

    if (mode === 'crop' && cropStart && cropEnd) {
      let x = Math.min(cropStart.x, cropEnd.x)
      let y = Math.min(cropStart.y, cropEnd.y)
      let w = Math.abs(cropEnd.x - cropStart.x)
      let h = Math.abs(cropEnd.y - cropStart.y)

      // Dark overlay
      ctx.fillStyle = 'rgba(0,0,0,0.52)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Bright crop area
      ctx.save()
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(livePreview, -sw/2, -sh/2, sw, sh)
      ctx.restore()

      // Rule-of-thirds grid
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 0.5
        for (let i = 1; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(x + w*i/3, y); ctx.lineTo(x + w*i/3, y+h); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x, y + h*i/3); ctx.lineTo(x+w, y + h*i/3); ctx.stroke()
        }
      }

      // Crop border
      ctx.strokeStyle = '#00e5a0'
      ctx.lineWidth = 1.5
      ctx.setLineDash([])
      ctx.strokeRect(x, y, w, h)

      // Corner handles
      const corners2 = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]
      corners2.forEach(([cx,cy]) => {
        ctx.fillStyle = '#00e5a0'
        ctx.fillRect(cx-5, cy-5, 10, 10)
      })

      // L-shaped thick corners
      const arm = 18, lw = 3
      ctx.strokeStyle = '#00e5a0'; ctx.lineWidth = lw; ctx.setLineDash([])
      ;[[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([cx,cy,dx,dy]) => {
        ctx.beginPath(); ctx.moveTo(+cx + (+dx)*arm, +cy); ctx.lineTo(+cx,+cy); ctx.lineTo(+cx,+cy+(+dy)*arm); ctx.stroke()
      })

      // Dimensions label
      ctx.font = '11px IBM Plex Mono, monospace'
      ctx.fillStyle = '#00e5a0'
      ctx.fillText(`${Math.round(w/displayScale)} × ${Math.round(h/displayScale)}px`, x+4, y > 18 ? y-6 : y+h+14)

    } else if (mode === 'scan' && corners.length === 4) {
      // Overlay
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Bright polygon
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      corners.forEach(c => ctx.lineTo(c.x, c.y))
      ctx.closePath(); ctx.clip()
      ctx.translate(canvas.width/2, canvas.height/2)
      ctx.rotate((rotation*Math.PI)/180)
      ctx.drawImage(livePreview, -sw/2, -sh/2, sw, sh)
      ctx.restore()

      // Polygon border
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      corners.forEach(c => ctx.lineTo(c.x, c.y))
      ctx.closePath()
      ctx.strokeStyle = '#00e5a0'; ctx.lineWidth = 2; ctx.setLineDash([6,3]); ctx.stroke()
      ctx.setLineDash([])

      // Corner handles
      corners.forEach((c, i) => {
        ctx.beginPath()
        ctx.arc(c.x, c.y, 10, 0, Math.PI*2)
        ctx.fillStyle = i === dragCorner ? '#ffffff' : '#00e5a0'
        ctx.fill()
        ctx.strokeStyle = '#003322'; ctx.lineWidth = 2; ctx.stroke()
      })
    }
  }, [displayScale, rotation, cropStart, cropEnd, mode, corners, dragCorner, showGrid, getRotatedDims, buildLivePreview])

  useEffect(() => { draw() }, [draw])

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): Point => {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    const sx = canvas.width / r.width
    const sy = canvas.height / r.height

    let clientX: number
    let clientY: number

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX
      clientY = e.changedTouches[0].clientY
    } else {
      const me = e as React.MouseEvent | MouseEvent
      clientX = me.clientX
      clientY = me.clientY
    }

    const x = (clientX - r.left) * sx
    const y = (clientY - r.top) * sy

    return {
      x: clamp(x, 0, canvas.width),
      y: clamp(y, 0, canvas.height),
    }
  }

  // ─── Crop Mode Handlers ───────────────────────────────────────────────────────
  const applyAspectLock = (start: Point, end: Point): Point => {
    if (aspectLock === 'free') return end
    let ratio = aspectLock === 'cnic' ? CNIC_RATIO : aspectLock === 'a4' ? A4_RATIO : 1
    const w = end.x - start.x
    const h = w / ratio
    return { x: end.x, y: start.y + h }
  }

  const onCropDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'crop') return
    setIsDragging(true); const p = getPos(e); setCropStart(p); setCropEnd(null)
  }
  const onCropMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'crop' || !isDragging || !cropStart) return
    setCropEnd(applyAspectLock(cropStart, getPos(e)))
  }
  const onCropUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'crop') return
    setIsDragging(false)
    if (cropStart) setCropEnd(applyAspectLock(cropStart, getPos(e)))
  }

  // ─── Scan Mode Handlers ────────────────────────────────────────────────────────
  const onScanDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'scan') return
    const p = getPos(e)
    const idx = corners.findIndex(c => Math.hypot(c.x-p.x, c.y-p.y) < 20)
    if (idx >= 0) setDragCorner(idx)
  }
  const onScanMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'scan' || dragCorner === null) return
    const p = getPos(e)
    setCorners(prev => prev.map((c, i) => i === dragCorner ? p : c))
  }
  const onScanUp = () => { if (mode === 'scan') setDragCorner(null) }

  // ─── Unified Handlers ─────────────────────────────────────────────────────────
  const onDown  = (e: React.MouseEvent | React.TouchEvent) => { mode === 'crop' ? onCropDown(e)  : onScanDown(e) }
  const onMove  = (e: React.MouseEvent | React.TouchEvent) => { mode === 'crop' ? onCropMove(e)  : onScanMove(e) }
  const onUp    = (e: React.MouseEvent | React.TouchEvent) => { mode === 'crop' ? onCropUp(e)    : onScanUp() }

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (mode === 'crop' && isDragging && cropStart) {
        setCropEnd(applyAspectLock(cropStart, getPos(e)))
      } else if (mode === 'scan' && dragCorner !== null) {
        const p = getPos(e)
        setCorners(prev => prev.map((c, i) => i === dragCorner ? p : c))
      }
    }

    const onWindowMouseUp = (e: MouseEvent) => {
      if (mode === 'crop' && isDragging) {
        setIsDragging(false)
        if (cropStart) setCropEnd(applyAspectLock(cropStart, getPos(e)))
      }
      if (mode === 'scan' && dragCorner !== null) {
        setDragCorner(null)
      }
    }

    const onWindowTouchMove = (e: TouchEvent) => {
      if (mode === 'crop' && isDragging && cropStart) {
        e.preventDefault()
        setCropEnd(applyAspectLock(cropStart, getPos(e)))
      } else if (mode === 'scan' && dragCorner !== null) {
        e.preventDefault()
        const p = getPos(e)
        setCorners(prev => prev.map((c, i) => i === dragCorner ? p : c))
      }
    }

    const onWindowTouchEnd = (e: TouchEvent) => {
      if (mode === 'crop' && isDragging) {
        setIsDragging(false)
        if (cropStart) setCropEnd(applyAspectLock(cropStart, getPos(e)))
      }
      if (mode === 'scan' && dragCorner !== null) {
        setDragCorner(null)
      }
    }

    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
    window.addEventListener('touchend', onWindowTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
      window.removeEventListener('touchmove', onWindowTouchMove)
      window.removeEventListener('touchend', onWindowTouchEnd)
    }
  }, [mode, isDragging, cropStart, dragCorner, applyAspectLock])

  const zoomBy = (delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(3, +(prev + delta).toFixed(2))))
  }

  const panViewport = (dx: number, dy: number) => {
    const viewport = canvasViewportRef.current
    if (!viewport) return
    viewport.scrollBy({ left: dx, top: dy, behavior: 'smooth' })
  }

  const autoDetect = () => {
    const canvas = canvasRef.current!
    const { w: imgW, h: imgH } = getRotatedDims()

    const rotCanvas = document.createElement('canvas')
    rotCanvas.width = imgW
    rotCanvas.height = imgH
    const rotCtx = rotCanvas.getContext('2d')!
    rotCtx.translate(imgW / 2, imgH / 2)
    rotCtx.rotate((rotation * Math.PI) / 180)
    rotCtx.drawImage(image, -image.width / 2, -image.height / 2)

    const detected = detectDocumentCorners(rotCanvas)
    if (detected && detected.length === 4) {
      const scale = displayScale
      const scaled = detected.map(c => ({
        x: Math.max(0, Math.min(canvas.width, c.x * scale)),
        y: Math.max(0, Math.min(canvas.height, c.y * scale)),
      }))

      if (mode === 'scan') {
        setCorners(scaled)
        return
      }

      const xs = scaled.map(p => p.x)
      const ys = scaled.map(p => p.y)
      setCropStart({ x: Math.min(...xs), y: Math.min(...ys) })
      setCropEnd({ x: Math.max(...xs), y: Math.max(...ys) })
      return
    }

    if (mode === 'crop') {
      const cnicW = canvas.width * 0.88
      const cnicH = cnicW / CNIC_RATIO
      const cx = (canvas.width - cnicW) / 2
      const cy = (canvas.height - cnicH) / 2
      setCropStart({ x: cx, y: cy })
      setCropEnd({ x: cx + cnicW, y: cy + cnicH })
    } else {
      const pad = canvas.width * 0.05
      setCorners([
        { x: pad, y: pad },
        { x: canvas.width - pad, y: pad },
        { x: canvas.width - pad, y: canvas.height - pad },
        { x: pad, y: canvas.height - pad },
      ])
    }
  }

  // ─── Export ────────────────────────────────────────────────────────────────────
  const confirmCrop = () => {
    const { w: imgW, h: imgH } = getRotatedDims()

    // Build full-res rotated image
    const rotCanvas = document.createElement('canvas')
    rotCanvas.width = imgW; rotCanvas.height = imgH
    const rotCtx = rotCanvas.getContext('2d')!
    rotCtx.filter = `brightness(${1+brightness/100}) contrast(${1+contrast/100})`
    rotCtx.translate(imgW/2, imgH/2)
    rotCtx.rotate((rotation*Math.PI)/180)
    rotCtx.drawImage(image, -image.width/2, -image.height/2)
    rotCtx.filter = 'none'

    let finalCanvas: HTMLCanvasElement

    if (mode === 'scan' && corners.length === 4) {
      // Perspective unwarp
      const scale = 1 / displayScale
      const srcCorners = corners.map(c => ({ x: c.x * scale, y: c.y * scale }))
      const dstW = Math.round(Math.hypot(srcCorners[1].x-srcCorners[0].x, srcCorners[1].y-srcCorners[0].y))
      const dstH = Math.round(Math.hypot(srcCorners[3].x-srcCorners[0].x, srcCorners[3].y-srcCorners[0].y))
      finalCanvas = perspectiveTransform(rotCanvas, imgW, imgH, srcCorners, dstW, dstH)
    } else {
      finalCanvas = document.createElement('canvas')
      const fCtx = finalCanvas.getContext('2d')!
      if (cropStart && cropEnd) {
        const x = Math.min(cropStart.x, cropEnd.x) / displayScale
        const y = Math.min(cropStart.y, cropEnd.y) / displayScale
        const w = Math.abs(cropEnd.x - cropStart.x) / displayScale
        const h = Math.abs(cropEnd.y - cropStart.y) / displayScale
        finalCanvas.width = Math.round(w); finalCanvas.height = Math.round(h)
        fCtx.drawImage(rotCanvas, x, y, w, h, 0, 0, finalCanvas.width, finalCanvas.height)
      } else {
        finalCanvas.width = imgW; finalCanvas.height = imgH
        fCtx.drawImage(rotCanvas, 0, 0)
      }
    }

    // Apply filter at full res
    if (filter !== 'original') {
      const fCtx = finalCanvas.getContext('2d')!
      applyFilter(fCtx, finalCanvas.width, finalCanvas.height, filter)
    }

    onConfirm(finalCanvas.toDataURL('image/jpeg', 0.95))
  }

  // ─── Styles ────────────────────────────────────────────────────────────────────
  const s = {
    overlay: {
      position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    },
    modal: {
      background: 'var(--bg2,#0f1117)', border: '0.5px solid var(--border2,#2a2d36)',
      borderRadius: 16, padding: '1.25rem', maxWidth: 580, width: '94vw',
      maxHeight: '95vh', overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 10,
    },
    tabs: { display: 'flex', gap: 6, background: 'var(--bg,#080a0e)', borderRadius: 8, padding: 4 },
    tab: (active: boolean): React.CSSProperties => ({
      flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontFamily: 'var(--font-mono,monospace)', fontSize: 12, fontWeight: 600,
      background: active ? 'var(--green,#00e5a0)' : 'transparent',
      color: active ? '#000' : 'var(--text2,#8b8fa8)',
      transition: 'all 0.15s',
    }),
    filterRow: { display: 'flex', gap: 6, overflowX: 'auto' as const, paddingBottom: 2 },
    filterBtn: (active: boolean): React.CSSProperties => ({
      flexShrink: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
      gap: 3, padding: '6px 12px', borderRadius: 8, border: `1px solid ${active ? 'var(--green,#00e5a0)' : 'var(--border,#23262e)'}`,
      background: active ? 'rgba(0,229,160,0.1)' : 'var(--bg,#080a0e)',
      color: active ? 'var(--green,#00e5a0)' : 'var(--text2,#8b8fa8)',
      cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono,monospace)', fontWeight: 600,
      transition: 'all 0.12s',
    }),
    sliderRow: { display: 'flex', alignItems: 'center', gap: 8 },
    sliderLabel: { fontSize: 10, fontFamily: 'var(--font-mono,monospace)', color: 'var(--text2,#8b8fa8)', width: 72, flexShrink: 0 },
    slider: { flex: 1, accentColor: 'var(--green,#00e5a0)', height: 3 },
  }

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 14, fontWeight: 700, color: 'var(--green,#00e5a0)' }}>
            {title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2,#8b8fa8)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Mode Tabs */}
        <div style={s.tabs}>
          <button style={s.tab(mode === 'crop')} onClick={() => setMode('crop')}>✂ Crop</button>
          <button style={s.tab(mode === 'scan')} onClick={() => setMode('scan')}>📄 Doc Scanner</button>
        </div>

        {/* Canvas with zoom + XY scroll */}
        <div style={{ background: '#030405', borderRadius: 10, border: '0.5px solid var(--border,#1e2029)', padding: 8 }}>
          <div
            ref={canvasViewportRef}
            style={{
              overflow: 'auto',
              maxHeight: '52vh',
              borderRadius: 8,
              border: '0.5px solid var(--border,#1e2029)',
              background: '#020305',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                display: 'block',
                width: `${Math.max(1, Math.round((canvasRef.current?.width ?? 0)))}px`,
                height: `${Math.max(1, Math.round((canvasRef.current?.height ?? 0)))}px`,
                cursor: mode === 'scan' ? 'default' : 'crosshair',
                touchAction: 'none'
              }}
              onMouseDown={onDown}
              onTouchStart={(e) => { e.preventDefault(); onDown(e) }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono,monospace)', color: 'var(--text2,#8b8fa8)', width: 68 }}>Zoom {Math.round(zoom * 100)}%</span>
            <button className="btn-outline" onClick={() => zoomBy(-0.1)} style={{ padding: '4px 8px' }}>−</button>
            <input
              type="range"
              min={50}
              max={300}
              step={5}
              value={Math.round(zoom * 100)}
              style={{ flex: 1, accentColor: 'var(--green,#00e5a0)' }}
              onChange={(e) => setZoom(Math.max(0.5, Math.min(3, +e.target.value / 100)))}
            />
            <button className="btn-outline" onClick={() => zoomBy(0.1)} style={{ padding: '4px 8px' }}>+</button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={() => panViewport(-120, 0)} style={{ padding: '4px 8px' }}>← X</button>
            <button className="btn-outline" onClick={() => panViewport(120, 0)} style={{ padding: '4px 8px' }}>X →</button>
            <button className="btn-outline" onClick={() => panViewport(0, -120)} style={{ padding: '4px 8px' }}>↑ Y</button>
            <button className="btn-outline" onClick={() => panViewport(0, 120)} style={{ padding: '4px 8px' }}>Y ↓</button>
          </div>
        </div>

        {/* Filters */}
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono,monospace)', color: 'var(--text2,#8b8fa8)', marginBottom: 6 }}>FILTER</div>
          <div style={s.filterRow}>
            {FILTERS.map(f => (
              <button key={f.id} style={s.filterBtn(filter === f.id)} onClick={() => setFilter(f.id)}>
                <span style={{ fontSize: 16 }}>{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={s.sliderRow}>
            <span style={s.sliderLabel}>Brightness {brightness > 0 ? `+${brightness}` : brightness}</span>
            <input type="range" min={-80} max={80} value={brightness} style={s.slider}
              onChange={e => setBrightness(+e.target.value)} />
          </div>
          <div style={s.sliderRow}>
            <span style={s.sliderLabel}>Contrast {contrast > 0 ? `+${contrast}` : contrast}</span>
            <input type="range" min={-80} max={80} value={contrast} style={s.slider}
              onChange={e => setContrast(+e.target.value)} />
          </div>
        </div>

        {/* Crop-mode options */}
        {mode === 'crop' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono,monospace)', color: 'var(--text2,#8b8fa8)' }}>RATIO:</span>
            {(['free','cnic','a4','square'] as const).map(r => (
              <button key={r} onClick={() => setAspectLock(r)} style={{
                padding: '4px 10px', borderRadius: 6, border: `1px solid ${aspectLock === r ? 'var(--green,#00e5a0)' : 'var(--border,#23262e)'}`,
                background: aspectLock === r ? 'rgba(0,229,160,0.1)' : 'transparent',
                color: aspectLock === r ? 'var(--green,#00e5a0)' : 'var(--text2,#8b8fa8)',
                fontSize: 10, fontFamily: 'var(--font-mono,monospace)', cursor: 'pointer', fontWeight: 600,
              }}>
                {r === 'free' ? 'Free' : r === 'cnic' ? 'CNIC' : r === 'a4' ? 'A4' : '1:1'}
              </button>
            ))}
            <button onClick={() => setShowGrid(p => !p)} style={{
              marginLeft: 'auto', padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${showGrid ? 'var(--green,#00e5a0)' : 'var(--border,#23262e)'}`,
              background: showGrid ? 'rgba(0,229,160,0.1)' : 'transparent',
              color: showGrid ? 'var(--green,#00e5a0)' : 'var(--text2,#8b8fa8)',
              fontSize: 10, fontFamily: 'var(--font-mono,monospace)', cursor: 'pointer', fontWeight: 600,
            }}>⊞ Grid</button>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={() => setRotation(p => (p + 90) % 360)}>↻ Rotate</button>
          <button className="btn-outline" onClick={autoDetect}>⊡ Smart Detect</button>
          <button className="btn-outline" onClick={() => {
            setCropStart(null); setCropEnd(null)
            setBrightness(0); setContrast(0)
            setFilter('original')
            setZoom(1)
            setDisplayScale(fitScale)
            const canvas = canvasRef.current!
            const pad = canvas.width * 0.1
            setCorners([
              { x: pad, y: pad }, { x: canvas.width-pad, y: pad },
              { x: canvas.width-pad, y: canvas.height-pad }, { x: pad, y: canvas.height-pad },
            ])
          }}>↺ Reset</button>
          <button className="btn-green" style={{ flex: 1, minWidth: 120 }} onClick={confirmCrop}>
            {mode === 'scan' ? '📄 Scan & Apply' : '✓ Apply Crop'}
          </button>
        </div>

        <button className="btn-outline" style={{ border: 'none', color: 'var(--text2,#8b8fa8)', width: '100%' }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}