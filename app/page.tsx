'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import CropModal from './components/CropModal'
import PagePreview from './components/PagePreview'
import CameraCaptureModal from './components/CameraCaptureModal'

type PageSize = 'A4' | 'A5' | 'A6'
type Side = 'front' | 'back'

const LAYOUTS: Record<PageSize, { cols: number; rows: number; perSide: number; rotated: boolean }> = {
  A4: { cols: 2, rows: 4, perSide: 8, rotated: false },
  A5: { cols: 2, rows: 2, perSide: 4, rotated: true },
  A6: { cols: 1, rows: 2, perSide: 2, rotated: false },
}

const CNIC_MM = { w: 85.6, h: 54 }
const MARGIN_MM = 8

const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
}

interface CropTarget {
  img: HTMLImageElement
  side: Side
  initialMode?: 'crop' | 'scan'
  autoDetectOnOpen?: boolean
}

export default function Home() {
  const [isMobile, setIsMobile] = useState(false)
  const [pageSize, setPageSize] = useState<PageSize>('A4')
  const [frontImg, setFrontImg] = useState<string | null>(null)
  const [backImg, setBackImg] = useState<string | null>(null)
  const [frontRaw, setFrontRaw] = useState<string | null>(null)
  const [backRaw, setBackRaw] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null)
  const [cameraSide, setCameraSide] = useState<Side | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentSide = useRef<Side>('front')

  const layout = LAYOUTS[pageSize]
  const perSide = layout.perSide

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 940)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const openCropFromData = (dataUrl: string, side: Side, options?: { scanMode?: boolean }) => {
    const img = new Image()
    img.onload = () => {
      setCropTarget({
        img,
        side,
        initialMode: options?.scanMode ? 'scan' : 'crop',
        autoDetectOnOpen: !!options?.scanMode,
      })
    }
    img.src = dataUrl
  }

  const triggerUpload = (side: Side) => {
    currentSide.current = side
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const startCameraFlow = (side: Side) => {
    setCameraSide(side)
  }

  const reEdit = (side: Side) => {
    const src = side === 'front' ? frontRaw : backRaw
    if (!src) return
    openCropFromData(src, side)
  }

  const onCameraCapture = (dataUrl: string) => {
    if (!cameraSide) return
    if (cameraSide === 'front') setFrontRaw(dataUrl)
    else setBackRaw(dataUrl)
    openCropFromData(dataUrl, cameraSide, { scanMode: true })
    setCameraSide(null)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const side = currentSide.current
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (side === 'front') setFrontRaw(dataUrl)
      else setBackRaw(dataUrl)
      openCropFromData(dataUrl, side)
    }
    reader.readAsDataURL(file)
  }

  const handleCropConfirm = (dataURL: string) => {
    if (cropTarget?.side === 'front') setFrontImg(dataURL)
    else setBackImg(dataURL)
    setCropTarget(null)
  }

  const buildSlots = (type: Side) => {
    const img = type === 'front' ? frontImg : backImg
    return Array.from({ length: perSide }, (_, i) => ({
      image: img,
      label: `${type.toUpperCase()} ${i + 1}`,
      isActive: i < quantity,
      type,
    }))
  }

  const downloadPDF = useCallback(async () => {
    if (!frontImg || !backImg) return
    setPdfLoading(true)

    try {
      const { jsPDF } = await import('jspdf')
      const page = PAGE_MM[pageSize]
      const cols = layout.cols
      const rows = layout.rows
      const rotated = layout.rotated
      const cnicW = rotated ? CNIC_MM.h : CNIC_MM.w
      const cnicH = rotated ? CNIC_MM.w : CNIC_MM.h

      const gapX = cols > 1 ? (page.w - MARGIN_MM * 2 - cnicW * cols) / (cols - 1) : 0
      const gapY = rows > 1 ? (page.h - MARGIN_MM * 2 - cnicH * rows) / (rows - 1) : 0

      const usedW = cnicW * cols + gapX * (cols - 1)
      const usedH = cnicH * rows + gapY * (rows - 1)
      const startX = (page.w - usedW) / 2
      const startY = (page.h - usedH) / 2

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: pageSize.toLowerCase() as any })

      const getFinalImgBase64 = async (src: string): Promise<string> => {
        if (!rotated) return src
        return new Promise<string>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.height
            canvas.height = img.width
            const ctx = canvas.getContext('2d')!
            ctx.translate(canvas.width / 2, canvas.height / 2)
            ctx.rotate((90 * Math.PI) / 180)
            ctx.drawImage(img, -img.width / 2, -img.height / 2)
            resolve(canvas.toDataURL('image/jpeg', 1.0))
          }
          img.src = src
        })
      }

      const printFrontImg = await getFinalImgBase64(frontImg)
      const printBackImg = await getFinalImgBase64(backImg)

      for (let i = 0; i < layout.perSide; i++) {
        if (i >= quantity) break
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = startX + col * (cnicW + gapX)
        const y = startY + row * (cnicH + gapY)
        pdf.addImage(printFrontImg, 'JPEG', x, y, cnicW, cnicH)
      }

      pdf.addPage()
      for (let i = 0; i < layout.perSide; i++) {
        if (i >= quantity) break
        const col = i % cols
        const row = Math.floor(i / cols)
        const mirrorCol = (cols - 1) - col
        const x = startX + mirrorCol * (cnicW + gapX)
        const y = startY + row * (cnicH + gapY)
        pdf.addImage(printBackImg, 'JPEG', x, y, cnicW, cnicH)
      }

      pdf.save(`cnic-print-${pageSize}-x${quantity}.pdf`)
    } catch (err) {
      console.error(err)
    }

    setPdfLoading(false)
  }, [frontImg, backImg, pageSize, quantity, layout])

  const readyToPrint = !!frontImg && !!backImg

  return (
    <div className="app-shell">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {cameraSide && (
        <CameraCaptureModal
          side={cameraSide}
          onCapture={onCameraCapture}
          onClose={() => setCameraSide(null)}
        />
      )}

      {cropTarget && (
        <CropModal
          image={cropTarget.img}
          title={`CNIC Editor - ${cropTarget.side === 'front' ? 'Front' : 'Back'}`}
          initialMode={cropTarget.initialMode}
          autoDetectOnOpen={cropTarget.autoDetectOnOpen}
          onConfirm={handleCropConfirm}
          onClose={() => setCropTarget(null)}
        />
      )}

      <header className="topbar" style={{ padding: isMobile ? '12px 14px' : '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-mark">🪪</div>
          <div>
            <div className="brand-title">CNIC Print Studio Pro</div>
            <div className="brand-subtitle">Canva-style editing and duplex-ready output</div>
          </div>
        </div>
        <div className="topbar-badge">85.6 x 54 mm</div>
      </header>

      <section className="hero-panel" style={{ alignItems: 'center' }}>
        <div>
          <div className="hero-kicker">EDITOR WORKSPACE</div>
          <h1 className="hero-title">Scan, Re-edit, and Print without friction.</h1>
          <p className="hero-copy">
            Upload ya camera se capture karo, auto-straighten ke sath edit karo, aur bina re-upload ke kisi bhi side ko dubara edit karo.
            Final layout instant preview me update hota hai.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-card"><span className="stat-label">Re-edit</span><div className="stat-value">No re-upload needed</div></div>
          <div className="stat-card"><span className="stat-label">Mobile Scan</span><div className="stat-value">Guide frame camera</div></div>
          <div className="stat-card"><span className="stat-label">Auto</span><div className="stat-value">Straighten on capture</div></div>
          <div className="stat-card"><span className="stat-label">Output</span><div className="stat-value">Instant print layout</div></div>
        </div>
      </section>

      <div className="workspace-shell">
        <aside className="sidebar-panel" style={{ width: isMobile ? '100%' : 330 }}>
          <div className="section-card">
            <div className="section-kicker">Page Size</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(['A4', 'A5', 'A6'] as PageSize[]).map(p => (
                <button key={p} className={`btn-outline${pageSize === p ? ' active' : ''}`} onClick={() => { setPageSize(p); setQuantity(1) }} style={{ flex: 1, padding: '8px 0' }}>
                  {p}
                </button>
              ))}
            </div>
            <div className="section-note">{perSide} copies per side</div>
          </div>

          <div className="section-card">
            <div className="section-kicker">Front Side</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn-outline" onClick={() => triggerUpload('front')} style={{ flex: 1 }}>Upload</button>
              <button className="btn-outline" onClick={() => startCameraFlow('front')} style={{ flex: 1 }}>Camera</button>
              <button className="btn-outline" onClick={() => reEdit('front')} disabled={!frontRaw} style={{ width: '100%' }}>Re-edit without re-upload</button>
            </div>
            <div className="section-note">{frontImg ? 'Edited and ready' : 'Image not set'}</div>
          </div>

          <div className="section-card">
            <div className="section-kicker">Back Side</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn-outline" onClick={() => triggerUpload('back')} style={{ flex: 1 }}>Upload</button>
              <button className="btn-outline" onClick={() => startCameraFlow('back')} style={{ flex: 1 }}>Camera</button>
              <button className="btn-outline" onClick={() => reEdit('back')} disabled={!backRaw} style={{ width: '100%' }}>Re-edit without re-upload</button>
            </div>
            <div className="section-note">{backImg ? 'Edited and ready' : 'Image not set'}</div>
          </div>

          <div className="section-card">
            <div className="section-kicker">Quantity</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 8 }}>
              {Array.from({ length: Math.max(layout.perSide, 4) }, (_, i) => i + 1).map(n => {
                const available = n <= layout.perSide
                return (
                  <button
                    key={n}
                    onClick={() => available && setQuantity(n)}
                    style={{
                      padding: '8px 0',
                      borderRadius: 7,
                      border: `0.5px solid ${quantity === n ? 'var(--green)' : available ? 'var(--border2)' : 'var(--border)'}`,
                      background: quantity === n ? 'var(--green-dim)' : 'transparent',
                      color: quantity === n ? 'var(--green)' : available ? 'var(--text)' : 'var(--text3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      cursor: available ? 'pointer' : 'not-allowed',
                      opacity: available ? 1 : 0.35,
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>

          <button className="btn-green" disabled={!readyToPrint || pdfLoading} onClick={downloadPDF} style={{ width: '100%', marginTop: 'auto' }}>
            {pdfLoading ? 'Generating PDF...' : 'Download Duplex PDF'}
          </button>

          <div className="status-card" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.7, color: 'var(--text2)' }}>
            {!frontImg && 'Front side set karein'}<br />
            {!backImg && 'Back side set karein'}
            {readyToPrint && <span style={{ color: 'var(--green)' }}>Ready: {quantity} copies on {pageSize}</span>}
          </div>
        </aside>

        <main className="workspace-panel" style={{ flex: 1, minWidth: 0, padding: isMobile ? '14px' : '20px' }}>
          <div className="preview-header">
            <span className="preview-kicker">LIVE PRINT LAYOUT</span>
            <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
            <span className="preview-chip">{pageSize} · {quantity}/{perSide}</span>
          </div>

          <div className="preview-grid">
            <PagePreview
              pageSize={pageSize}
              slots={buildSlots('front')}
              cols={layout.cols}
              rows={layout.rows}
              label="Page 1 - Front Side"
              type="front"
              rotated={layout.rotated}
              compact={isMobile}
            />
            <PagePreview
              pageSize={pageSize}
              slots={buildSlots('back')}
              cols={layout.cols}
              rows={layout.rows}
              label="Page 2 - Back Side"
              type="back"
              rotated={layout.rotated}
              compact={isMobile}
            />
          </div>

          <div className="helper-panel" style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
              Workflow: Camera/Upload -> Auto Straighten -> Fine Edit -> Instant Layout -> Duplex Print.
              Re-edit option se aap kisi bhi time original scan ko dubara khol sakte hain.
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
