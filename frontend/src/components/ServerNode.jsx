import { useRef, useCallback, useEffect } from 'react'
import MetricChart from './MetricChart'

const MAX_TILT      = 15      
const SCALE_HOVER   = 1.055   
const RESET_LERP    = 0.10    
const RESET_EPSILON = 0.04    
const GLARE_OPACITY = 0.12    

const STATUS = {
  operational: {
    dot:    '#22c55e',
    glow:   'rgba(34,197,94,0.55)',
    border: 'rgba(34,197,94,0.20)',
    label:  'LIVE',
  },
  warning: {
    dot:    '#f59e0b',
    glow:   'rgba(245,158,11,0.55)',
    border: 'rgba(245,158,11,0.22)',
    label:  'WARN',
  },
  critical: {
    dot:    '#ef4444',
    glow:   'rgba(239,68,68,0.60)',
    border: 'rgba(239,68,68,0.25)',
    label:  'CRIT',
  },
  offline: {
    dot:    '#475569',
    glow:   'rgba(71,85,105,0.40)',
    border: 'rgba(71,85,105,0.18)',
    label:  'OFF',
  },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const fmt = {
  cpu:      (v) => ({ val: `${Math.round(v)}`,          unit: '%'  }),
  mem:      (v) => ({ val: v.toFixed(1),                unit: 'GB' }),
  latency:  (v) => ({ val: `${Math.round(v)}`,          unit: 'ms' }),
  net:      (v) => ({ val: v.toFixed(1),                unit: 'MB/s' }),
  sessions: (v) => ({ val: v >= 1000
                          ? `${(v / 1000).toFixed(1)}k`
                          : `${Math.round(v)}`,          unit: 'sess' }),
}

const metricColor = (key, value) => {
  const thresholds = {
     cpu:     [60, 85],
     mem:     [80, 110],
     latency: [60, 120],
  }
  if (!thresholds[key]) return '#94a3b8'
  const [warn, crit] = thresholds[key]
  if (value >= crit) return '#ef4444'
  if (value >= warn) return '#f59e0b'
  return '#22c55e'
}

function StatCell({ label, metricKey, value }) {
  if (value === undefined || value === null) return null
  const { val, unit } = fmt[metricKey]?.(value) ?? { val: '—', unit: '' }
  const color = metricColor(metricKey, value)
  return (
    <div style={s.statCell}>
      <span style={{ ...s.statValue, color }}>{val}</span>
      <span style={s.statUnit}>{unit}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  )
}

function TagChip({ tag }) {
  return <span style={s.tagChip}>{tag}</span>
}

export default function ServerNode({ server, metrics, isActive, onFocus }) {
  // Dynamically calculate status based on live CPU usage
  const liveCpu = metrics?.cpu;
  const currentStatusKey = liveCpu !== undefined
    ? (liveCpu >= 90 ? 'critical' : liveCpu >= 70 ? 'warning' : 'operational')
    : (server.status || 'offline');

  const status = STATUS[currentStatusKey] ?? STATUS.offline;

  const cardRef  = useRef(null)
  const glareRef = useRef(null)
  const tiltRef  = useRef({ x: 0, y: 0 })       // current rendered tilt
  const rafRef   = useRef(null)                   // reset RAF id
  const hovering = useRef(false)

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current
    const glare = glareRef.current
    if (!card) return
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const rect = card.getBoundingClientRect()
    const nx = ((e.clientX - rect.left)  / rect.width  - 0.5) * 2  
    const ny = ((e.clientY - rect.top)   / rect.height - 0.5) * 2  

    const ry = clamp( nx * MAX_TILT, -MAX_TILT, MAX_TILT)
    const rx = clamp(-ny * MAX_TILT, -MAX_TILT, MAX_TILT)

    tiltRef.current.x = rx
    tiltRef.current.y = ry
    card.style.transform = [
      `perspective(800px)`,
      `rotateX(${rx}deg)`,
      `rotateY(${ry}deg)`,
      `scale(${SCALE_HOVER})`,
    ].join(' ')
    if (glare) {
      const gx = ((e.clientX - rect.left)  / rect.width)  * 100
      const gy = ((e.clientY - rect.top)   / rect.height) * 100
      const dist = Math.hypot(nx, ny)                 // 0 = centre, ~1.4 = corner
      const opacity = GLARE_OPACITY * (1 - dist * 0.5)
      glare.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,${opacity.toFixed(3)}) 0%, transparent 65%)`
      glare.style.opacity = '1'
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    hovering.current = false
    const card  = cardRef.current
    const glare = glareRef.current

    if (glare) glare.style.opacity = '0'

    const resetLoop = () => {
      const t   = tiltRef.current
      t.x = lerp(t.x, 0, RESET_LERP)
      t.y = lerp(t.y, 0, RESET_LERP)

      if (card) {
        card.style.transform = [
          `perspective(800px)`,
          `rotateX(${t.x}deg)`,
          `rotateY(${t.y}deg)`,
          `scale(1)`,
        ].join(' ')
      }
      if (Math.abs(t.x) > RESET_EPSILON || Math.abs(t.y) > RESET_EPSILON) {
        rafRef.current = requestAnimationFrame(resetLoop)
      } else {
        // snap to exactly zero and clear the loop
        t.x = 0
        t.y = 0
        if (card) card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)'
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(resetLoop)
  }, [])

  const handleMouseEnter = useCallback(() => {
    hovering.current = true
  }, [])

  const handleClick = useCallback(() => {
    onFocus?.(server.id)
  }, [onFocus, server.id])

  // cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      const card = cardRef.current
      if (card) card.style.transition = 'none'
    }
  }, [])

  return (
    <article
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      aria-label={`Server ${server.label}, status ${server.status}`}
      style={{
        ...s.card,
        borderColor: isActive ? status.border : 'rgba(56,189,248,0.10)',
        boxShadow: isActive
          ? `0 0 0 1px ${status.border}, 0 8px 40px rgba(0,0,0,0.6), 0 0 24px ${status.glow}`
          : s.card.boxShadow,
      }}
    >
      {/* ── corner accent marks — surface detail layer z:8 ── */}
      <span style={{ ...s.corner, ...s.cornerTL }} aria-hidden="true" />
      <span style={{ ...s.corner, ...s.cornerTR }} aria-hidden="true" />
      <span style={{ ...s.corner, ...s.cornerBL }} aria-hidden="true" />
      <span style={{ ...s.corner, ...s.cornerBR }} aria-hidden="true" />

      {/* ── specular glare overlay ── */}
      <div ref={glareRef} style={s.glare} aria-hidden="true" />

      {/* ── scan-line texture — surface z:8 ── */}
      <div style={s.scanLines} aria-hidden="true" />

      {/* ── header row — identity layer z:16 ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          {/* animated status dot */}
          <span style={s.dotWrapper} aria-hidden="true">
            <span style={{ ...s.dotPing, backgroundColor: status.dot, boxShadow: `0 0 0 0 ${status.glow}` }}
                  className="specter-ping" />
            <span style={{ ...s.dotCore, backgroundColor: status.dot, boxShadow: `0 0 6px ${status.glow}` }} />
          </span>
          <span style={s.statusBadge}>
            {status.label}
          </span>
        </div>
        <span style={s.regionTag}>{server.region.toUpperCase()}</span>
      </header>

      {/* ── server label — metadata layer z:20 ── */}
      <div style={s.labelRow}>
        <h2 style={s.serverLabel}>{server.label}</h2>
        <span style={s.serverIp}>{server.ip}</span>
      </div>

      {/* ── tag chips ── */}
      {server.tags?.length > 0 && (
        <div style={s.tagRow} aria-label="Server tags">
          {server.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      )}

      {/* ── MetricChart mount point — top layer z:36 ── */}
      <div style={s.chartMount} aria-label="Live metric chart">
        <MetricChart metrics={metrics} metricKey="cpu" />
      </div>

      {/* ── stat footer — data layer z:28 ── */}
      <footer style={s.statRow}>
        <StatCell label="CPU"     metricKey="cpu"     value={metrics?.cpu}     />
        <div style={s.statDivider} aria-hidden="true" />
        <StatCell label="MEM"     metricKey="mem"     value={metrics?.mem}     />
        <div style={s.statDivider} aria-hidden="true" />
        <StatCell label="LAT"     metricKey="latency" value={metrics?.latency} />
      </footer>
    </article>
  )
}

const lerp = (a, b, t) => a + (b - a) * t

const s = {
  card: {
    position:        'relative',
    width:           '220px',
    cursor:          'pointer',
    borderRadius:    '14px',
    border:          '1px solid rgba(56,189,248,0.10)',
    background:      'linear-gradient(160deg, rgba(15,23,42,0.92) 0%, rgba(7,14,30,0.97) 100%)',
    backdropFilter:  'blur(18px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
    boxShadow:       '0 8px 40px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset',
    padding:         '14px 14px 12px',
    transformStyle:  'preserve-3d',
    transition:      'border-color 0.3s ease, box-shadow 0.3s ease',
    userSelect:      'none',
    outline:         'none',
  },
  glare: {
    position:       'absolute',
    inset:          0,
    borderRadius:   'inherit',
    pointerEvents:  'none',
    opacity:        0,
    transition:     'opacity 0.25s ease',
    zIndex:         5,
    transform:      'translateZ(4px)',
  },
  scanLines: {
    position:       'absolute',
    inset:          0,
    borderRadius:   'inherit',
    background:     'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
    pointerEvents:  'none',
    transform:      'translateZ(8px)',
    zIndex:         2,
  },
  corner: {
    position:       'absolute',
    width:          '10px',
    height:         '10px',
    pointerEvents:  'none',
    transform:      'translateZ(8px)',
    zIndex:         3,
  },
  cornerTL: {
    top:         '6px',
    left:        '6px',
    borderTop:   '1.5px solid rgba(56,189,248,0.45)',
    borderLeft:  '1.5px solid rgba(56,189,248,0.45)',
    borderRadius: '3px 0 0 0',
  },
  cornerTR: {
    top:         '6px',
    right:       '6px',
    borderTop:   '1.5px solid rgba(56,189,248,0.45)',
    borderRight: '1.5px solid rgba(56,189,248,0.45)',
    borderRadius: '0 3px 0 0',
  },
  cornerBL: {
    bottom:      '6px',
    left:        '6px',
    borderBottom:'1.5px solid rgba(56,189,248,0.45)',
    borderLeft:  '1.5px solid rgba(56,189,248,0.45)',
    borderRadius: '0 0 0 3px',
  },
  cornerBR: {
    bottom:      '6px',
    right:       '6px',
    borderBottom:'1.5px solid rgba(56,189,248,0.45)',
    borderRight: '1.5px solid rgba(56,189,248,0.45)',
    borderRadius: '0 0 3px 0',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   '10px',
    transform:      'translateZ(16px)',
    position:       'relative',
    zIndex:         10,
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '7px',
  },
  dotWrapper: {
    position: 'relative',
    width:    '10px',
    height:   '10px',
    flexShrink: 0,
  },
  dotPing: {
    position:     'absolute',
    inset:        0,
    borderRadius: '50%',
    opacity:      0.5,
    animation:    'specter-ping 2.2s cubic-bezier(0,0,0.2,1) infinite',
  },
  dotCore: {
    position:     'absolute',
    inset:        '2px',
    borderRadius: '50%',
  },
  statusBadge: {
    fontSize:      '9px',
    fontWeight:    700,
    letterSpacing: '0.12em',
    color:         'rgba(148,163,184,0.7)',
    fontFamily:    "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
  },
  regionTag: {
    fontSize:       '8px',
    fontWeight:     600,
    letterSpacing:  '0.10em',
    color:          'rgba(56,189,248,0.45)',
    fontFamily:     "'JetBrains Mono', ui-monospace, monospace",
  },
  labelRow: {
    marginBottom:   '8px',
    transform:      'translateZ(20px)',
    position:       'relative',
    zIndex:         10,
  },
  serverLabel: {
    margin:        0,
    fontSize:      '12px',
    fontWeight:    700,
    letterSpacing: '0.08em',
    color:         '#e2e8f0',
    fontFamily:    "'Inter', ui-sans-serif, sans-serif",
    lineHeight:    1.2,
    textShadow:    '0 0 20px rgba(56,189,248,0.25)',
    whiteSpace:    'nowrap',
    overflow:      'hidden',
    textOverflow:  'ellipsis',
  },
  serverIp: {
    display:       'block',
    marginTop:     '2px',
    fontSize:      '10px',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
    color:         'rgba(100,116,139,0.75)',
    letterSpacing: '0.06em',
  },
  tagRow: {
    display:        'flex',
    flexWrap:       'wrap',
    gap:            '4px',
    marginBottom:   '10px',
    transform:      'translateZ(20px)',
    position:       'relative',
    zIndex:         10,
  },
  tagChip: {
    fontSize:      '8px',
    fontWeight:    600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color:         'rgba(56,189,248,0.6)',
    background:    'rgba(56,189,248,0.06)',
    border:        '1px solid rgba(56,189,248,0.12)',
    borderRadius:  '4px',
    padding:       '2px 6px',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
  },
  chartMount: {
    height:         '56px',
    marginBottom:   '10px',
    borderRadius:   '8px',
    overflow:       'hidden',
    background:     'rgba(7,14,30,0.70)',
    border:         '1px solid rgba(56,189,248,0.07)',
    transform:      'translateZ(36px)',
    position:       'relative',
    zIndex:         10,
  },
  statRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderTop:      '1px solid rgba(56,189,248,0.07)',
    paddingTop:     '9px',
    transform:      'translateZ(28px)',
    position:       'relative',
    zIndex:         10,
  },
  statCell: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '1px',
    flex:           1,
  },
  statValue: {
    fontSize:      '14px',
    fontWeight:    700,
    fontFamily:    "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
    lineHeight:    1,
    letterSpacing: '-0.02em',
  },
  statUnit: {
    fontSize:      '8px',
    fontWeight:    500,
    color:         'rgba(100,116,139,0.7)',
    letterSpacing: '0.06em',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
  },
  statLabel: {
    fontSize:      '8px',
    fontWeight:    600,
    color:         'rgba(100,116,139,0.55)',
    letterSpacing: '0.12em',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
  },
  statDivider: {
    width:          '1px',
    height:         '28px',
    background:     'rgba(56,189,248,0.07)',
    flexShrink:     0,
  },
}