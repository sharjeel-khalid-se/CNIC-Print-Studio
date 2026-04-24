'use client'

interface Slot {
  image: string | null
  label: string
  isActive: boolean
  type: 'front' | 'back'
}

interface PagePreviewProps {
  pageSize: 'A4' | 'A5' | 'A6'
  slots: Slot[]
  cols: number
  rows: number
  label: string
  type: 'front' | 'back'
  rotated?: boolean
  compact?: boolean
}

// Real mm dimensions scaled to display pixels
const PAGE_DISPLAY = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
}

// CNIC actual size: 85.6mm x 54mm
const CNIC_MM = { w: 85.6, h: 54 }
const MARGIN_MM = 4

export default function PagePreview({ pageSize, slots, cols, rows, label, type, rotated = false, compact = false }: PagePreviewProps) {
  const page = PAGE_DISPLAY[pageSize]

  // Scale: show page at a reasonable screen size
  const SCALE = compact
    ? pageSize === 'A4' ? 1.1 : pageSize === 'A5' ? 1.45 : 1.9
    : pageSize === 'A4' ? 1.9 : pageSize === 'A5' ? 2.4 : 3.2
  const pxW = Math.round(page.w * SCALE)
  const pxH = Math.round(page.h * SCALE)

  const marginPx = Math.round(MARGIN_MM * SCALE)
  
  // Apply rotation logic to W/H if required (specifically for A5 2x2 grid)
  const cnicW_mm = rotated ? CNIC_MM.h : CNIC_MM.w
  const cnicH_mm = rotated ? CNIC_MM.w : CNIC_MM.h

  const slotW = Math.round(cnicW_mm * SCALE)
  const slotH = Math.round(cnicH_mm * SCALE)

  // Usable area inside margins
  const usableW = pxW - marginPx * 2
  const usableH = pxH - marginPx * 2

  // Gap between slots (distribute remaining space evenly)
  const gapX = cols > 1 ? Math.round((usableW - slotW * cols) / (cols - 1)) : 0
  const gapY = rows > 1 ? Math.round((usableH - slotH * rows) / (rows - 1)) : 0

  // Total grid size
  const gridW = slotW * cols + gapX * (cols - 1)
  const gridH = slotH * rows + gapY * (rows - 1)

  // Center the grid within the page
  const startX = Math.round((pxW - gridW) / 2)
  const startY = Math.round((pxH - gridH) / 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
        color: type === 'front' ? 'var(--green)' : '#f09050',
        letterSpacing: 1, textTransform: 'uppercase',
        padding: '5px 10px', borderRadius: 999,
        border: `1px solid ${type === 'front' ? 'rgba(0,200,150,0.2)' : 'rgba(240,144,80,0.2)'}`,
        background: 'rgba(255,255,255,0.03)'
      }}>
        {label}
      </span>

      {/* Page shadow wrapper */}
      <div style={{
        position: 'relative',
        width: pxW,
        height: pxH,
        background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
        borderRadius: 14,
        boxShadow: '0 18px 46px rgba(0,0,0,0.38), 0 2px 10px rgba(0,0,0,0.18)',
        border: '1px solid rgba(255,255,255,0.28)',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Page grid lines (faint) */}
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
          width={pxW} height={pxH}
        >
          {/* Margin guides */}
          <rect
            x={marginPx} y={marginPx}
            width={pxW - marginPx * 2} height={pxH - marginPx * 2}
            fill="none" stroke="#e0e0e0" strokeWidth={0.5} strokeDasharray="3,3"
          />
          {/* Page border */}
          <rect x={0.5} y={0.5} width={pxW - 1} height={pxH - 1}
            fill="none" stroke="#ccc" strokeWidth={1} />
          <rect x={4} y={4} width={pxW - 8} height={pxH - 8} rx={10}
            fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth={1} />
          {/* Page size label */}
          <text x={pxW - 6} y={pxH - 5} fontSize={8}
            fill="#bbb" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
            {pageSize}
          </text>
        </svg>

        {/* Slots */}
        {slots.map((slot, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = startX + col * (slotW + gapX)
          const y = startY + row * (slotH + gapY)

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x, top: y,
                width: slotW, height: slotH,
                overflow: 'hidden',
              }}
            >
              {slot.image && slot.isActive ? (
                /* Filled slot with rotation support */
                <div style={{ position: 'relative', width: '100%', height: '100%',overflow: 'hidden' }}>
                  {rotated ? (
                    <img
                      src={slot.image}
                      alt={slot.label}
                      style={{
                        position: 'absolute',
                        width: "205px", height: slotW,
                        minWidth : "205px",
                        top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%) rotate(90deg)',
                        objectFit: 'fill', display: 'block'
                      }}
                    />
                  ) : (
                    <img
                      src={slot.image}
                      alt={slot.label}
                      style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                    />
                  )}
                </div>
              ) : slot.isActive ? (
                /* Empty active slot — placeholder */
                <div style={{
                  width: '100%', height: '100%',
                  background: type === 'front' ? 'rgba(0,200,150,0.07)' : 'rgba(240,144,80,0.07)',
                  border: `1px dashed ${type === 'front' ? 'rgba(0,200,150,0.35)' : 'rgba(240,144,80,0.35)'}`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                }}>
                  <svg width={18} height={14} viewBox="0 0 18 14" fill="none" style={{ transform: rotated ? 'rotate(90deg)' : 'none' }}>
                    <rect x={0.5} y={0.5} width={17} height={13} rx={1.5}
                      stroke={type === 'front' ? '#00c896' : '#f09050'} strokeWidth={1} strokeDasharray="2,2" />
                    <circle cx={6} cy={5} r={1.5} fill={type === 'front' ? '#00c896' : '#f09050'} opacity={0.5} />
                    <path d="M1 11 L5 8 L9 10 L13 7 L17 9" stroke={type === 'front' ? '#00c896' : '#f09050'} strokeWidth={0.8} opacity={0.5} />
                  </svg>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 7,
                    color: type === 'front' ? 'rgba(0,200,150,0.6)' : 'rgba(240,144,80,0.6)',
                    fontWeight: 600, letterSpacing: 0.5,
                  }}>
                    {slot.label}
                  </span>
                </div>
              ) : (
                /* Inactive slot */
                <div style={{
                  width: '100%', height: '100%',
                  background: 'rgba(0,0,0,0.04)',
                  border: '0.5px solid rgba(0,0,0,0.08)',
                }}/>
              )}
            </div>
          )
        })}
      </div>

      {/* Dimensions label */}
      <span style={{ fontSize: 11, color: '#9aa', fontFamily: 'var(--font-mono)' }}>
        {page.w} × {page.h} mm
      </span>
    </div>
  )
}