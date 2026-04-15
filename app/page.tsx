'use client'
import { useRef, useState, useCallback } from 'react'
import CropModal from './components/CropModal'
import PagePreview from './components/PagePreview'

type PageSize = 'A4' | 'A5' | 'A6'

// Exact layouts matching your provided screenshots:
// A5 uses a 2x2 grid which requires the CNIC cards to be rotated to fit.
const LAYOUTS: Record<PageSize, { cols: number; rows: number; perSide: number; rotated: boolean }> = {
  A4: { cols: 2, rows: 4, perSide: 8, rotated: false }, // 8 per side (Horizontal)
  A5: { cols: 2, rows: 2, perSide: 4, rotated: true },  // 4 per side (Portrait / Rotated)
  A6: { cols: 1, rows: 2, perSide: 2, rotated: false }, // 2 per side (Horizontal)
}

// For PDF: actual mm dimensions of CNIC
const CNIC_MM = { w: 85.6, h: 54 }
const MARGIN_MM = 8

const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
}

export default function Home() {
  const [pageSize, setPageSize] = useState<PageSize>('A4')
  const [frontImg, setFrontImg] = useState<string | null>(null)
  const [backImg, setBackImg] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [cropTarget, setCropTarget] = useState<{ img: HTMLImageElement; side: 'front' | 'back' } | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentSide = useRef<'front' | 'back'>('front')

  const layout = LAYOUTS[pageSize]
  const perSide = layout.perSide // Exact slots per page based on layout

  const triggerUpload = (side: 'front' | 'back') => {
    currentSide.current = side
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => setCropTarget({ img, side: currentSide.current })
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleCropConfirm = (dataURL: string) => {
    if (cropTarget?.side === 'front') setFrontImg(dataURL)
    else setBackImg(dataURL)
    setCropTarget(null)
  }

  const buildSlots = (type: 'front' | 'back') => {
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
      const layout = LAYOUTS[pageSize]
      const cols = layout.cols
      const rotated = layout.rotated

      // Determine dimensions taking rotation into account
      const cnicW = rotated ? CNIC_MM.h : CNIC_MM.w
      const cnicH = rotated ? CNIC_MM.w : CNIC_MM.h

      const gapX = cols > 1 ? (page.w - MARGIN_MM * 2 - cnicW * cols) / (cols - 1) : 0
      const rows = layout.rows
      const gapY = rows > 1 ? (page.h - MARGIN_MM * 2 - cnicH * rows) / (rows - 1) : 0

      const usedW = cnicW * cols + gapX * (cols - 1)
      const usedH = cnicH * rows + gapY * (rows - 1)
      const startX = (page.w - usedW) / 2
      const startY = (page.h - usedH) / 2

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: pageSize.toLowerCase() as any })

      // Helper function: If we need a rotated image for the PDF, generate it via offscreen canvas
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

      // Page 1: fronts
      for (let i = 0; i < layout.perSide; i++) {
        if (i >= quantity) break
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = startX + col * (cnicW + gapX)
        const y = startY + row * (cnicH + gapY)
        pdf.addImage(printFrontImg, 'JPEG', x, y, cnicW, cnicH)
      }

      // Page 2: backs
      pdf.addPage()
      for (let i = 0; i < layout.perSide; i++) {
        if (i >= quantity) break
        const col = i % cols
        const row = Math.floor(i / cols)
        // Duplex alignment logic (Mirror X axis so back perfectly matches front when flipped horizontally)
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
  }, [frontImg, backImg, pageSize, quantity])

  const readyToPrint = frontImg && backImg

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {cropTarget && (
        <CropModal
          image={cropTarget.img}
          title={`Crop CNIC — ${cropTarget.side === 'front' ? 'Front' : 'Back'}`}
          onConfirm={handleCropConfirm}
          onClose={() => setCropTarget(null)}
        />
      )}

      {/* Header */}
      <header style={{
        borderBottom: '0.5px solid var(--border)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={18} height={14} viewBox="0 0 18 14" fill="none">
              <rect x={0.5} y={0.5} width={17} height={13} rx={2} stroke="#000" strokeWidth={1.5} />
              <circle cx={5.5} cy={5} r={2} fill="#000" opacity={0.5} />
              <path d="M1 11 L5 8 L9 10 L13 7 L17 9" stroke="#000" strokeWidth={1.2} />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              CNIC Print Studio
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
              Duplex-ready layout generator
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          85.6 × 54 mm
        </div>
      </header>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 61px)' }}>

        {/* Left sidebar */}
        <aside style={{
          width: 240, flexShrink: 0,
          background: 'var(--bg2)',
          borderRight: '0.5px solid var(--border)',
          padding: '20px 16px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>

          {/* Page size */}
          <div>
            <Label>Page Size</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['A4', 'A5', 'A6'] as PageSize[]).map(p => (
                <button
                  key={p} className={`btn-outline${pageSize === p ? ' active' : ''}`}
                  onClick={() => { setPageSize(p); setQuantity(1) }}
                  style={{ flex: 1, padding: '7px 0' }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              {perSide} copies per side • {perSide} total slots
            </div>
          </div>

          {/* Upload */}
          <div>
            <Label>CNIC Images</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <UploadButton
                label="Front Side"
                done={!!frontImg}
                onClick={() => triggerUpload('front')}
                color="#00c896"
              />
              <UploadButton
                label="Back Side"
                done={!!backImg}
                onClick={() => triggerUpload('back')}
                color="#f09050"
              />
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label>Quantity (copies)</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {Array.from({ length: Math.max(layout.perSide, 3) }, (_, i) => i + 1).map(n => {
                const available = n <= layout.perSide
                return (
                  <button
                    key={n}
                    onClick={() => available && setQuantity(n)}
                    style={{
                      padding: '9px 0',
                      borderRadius: 6,
                      border: `0.5px solid ${quantity === n ? 'var(--green)' : available ? 'var(--border2)' : 'var(--border)'}`,
                      background: quantity === n ? 'var(--green-dim)' : 'transparent',
                      color: quantity === n ? 'var(--green)' : available ? 'var(--text)' : 'var(--text3)',
                      fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                      cursor: available ? 'pointer' : 'not-allowed',
                      opacity: available ? 1 : 0.3,
                      transition: 'all .12s',
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status */}
          <div style={{
            background: 'var(--bg3)', borderRadius: 8,
            border: '0.5px solid var(--border)',
            padding: '10px 12px', fontSize: 12, color: 'var(--text2)',
            lineHeight: 1.6,
          }}>
            {!frontImg && <div>↑ Upload front image</div>}
            {!backImg && <div>↑ Upload back image</div>}
            {readyToPrint && (
              <div style={{ color: 'var(--green)' }}>
                ✓ Ready — {quantity} cop{quantity > 1 ? 'ies' : 'y'} on {pageSize}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* PDF Download */}
          <button
            className="btn-green"
            disabled={!readyToPrint || pdfLoading}
            onClick={downloadPDF}
            style={{ width: '100%', fontSize: 13, padding: '12px 0' }}
          >
            {pdfLoading ? '⏳ Generating...' : '⬇ Download PDF'}
          </button>

          {readyToPrint && (
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, textAlign: 'center' }}>
              PDF mein 2 pages honge —<br />
              Page 1: Fronts · Page 2: Backs<br />
              Duplex print karo = perfect match
            </div>
          )}
        </aside>

        {/* Main preview area */}
        <main style={{
          flex: 1,
          padding: '24px',
          overflow: 'auto',
          background: 'var(--bg3)',
        }}>
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>
              PRINT PREVIEW
            </span>
            <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)',
              padding: '3px 8px', border: '0.5px solid var(--border)', borderRadius: 4,
            }}>
              {pageSize} · {quantity}/{perSide} slots
            </span>
          </div>

          {/* Two page previews side by side */}
          <div style={{
            display: 'flex',
            gap: 40,
            alignItems: 'flex-start',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            <PagePreview
              pageSize={pageSize}
              slots={buildSlots('front')}
              cols={layout.cols}
              rows={layout.rows}
              label={`Page 1 — Front Side`}
              type="front"
              rotated={layout.rotated}
            />
            <PagePreview
              pageSize={pageSize}
              slots={buildSlots('back')}
              cols={layout.cols}
              rows={layout.rows}
              label={`Page 2 — Back Side`}
              type="back"
              rotated={layout.rotated}
            />
          </div>

          {/* Duplex tip */}
          <div style={{
            marginTop: 28,
            background: 'var(--bg2)',
            border: '0.5px solid var(--border)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex', gap: 12, alignItems: 'flex-start',
            maxWidth: 620, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                Duplex Print Guide
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                PDF download karo → printer mein <strong style={{ color: 'var(--text)' }}>two-sided / duplex</strong> select karo →
                &nbsp;<strong style={{ color: 'var(--text)' }}>flip on long edge (standard)</strong> → print karo.
                Front aur back automatically align ho jaenge. Phir scissors se cut karo!
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
      color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1,
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function UploadButton({ label, done, onClick, color }: { label: string; done: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 14px',
        borderRadius: 8,
        border: `0.5px ${done ? 'solid' : 'dashed'} ${done ? color : 'var(--border2)'}`,
        background: done ? `${color}18` : 'transparent',
        color: done ? color : 'var(--text2)',
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
        cursor: 'pointer', textAlign: 'left',
        transition: 'all .15s',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <span style={{ fontSize: 14 }}>{done ? '✓' : '+'}</span>
      <span>{done ? `${label} — uploaded` : `Upload ${label}`}</span>
    </button>
  )
}