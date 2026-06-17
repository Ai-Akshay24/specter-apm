import { useRef, useEffect, useCallback } from 'react'
const DEFAULT_MAX_POINTS = 60     // visible data window
const TENSION            = 0.35   // cardinal spline tension  0=linear, 0.5=loose
const LINE_WIDTH         = 1.8    // px — sparkline stroke width
const GLOW_BLUR          = 6      // px — shadow blur for the neon glow pass
const PADDING_X          = 4      // px — left / right canvas padding
const PADDING_TOP        = 6      // px — headroom above peak value
const PADDING_BOTTOM     = 4      // px — floor gap below baseline
const IDLE_AMPLITUDE     = 0.12   // fraction of height — idle sine wave height
const IDLE_SPEED         = 0.0008 // radians per ms — idle wave animation speed
const METRIC_CONFIG = {
  cpu: {
    domain:      [0, 100],
    lineColor:   '#38bdf8',                    // cyan
    glowColor:   'rgba(56, 189, 248, 0.55)',
    fillTop:     'rgba(56, 189, 248, 0.22)',
    fillBottom:  'rgba(56, 189, 248, 0.00)',
    label:       'CPU %',
  },
  mem: {
    domain:      [0, 128],
    lineColor:   '#a78bfa',                    // violet
    glowColor:   'rgba(167, 139, 250, 0.55)',
    fillTop:     'rgba(167, 139, 250, 0.20)',
    fillBottom:  'rgba(167, 139, 250, 0.00)',
    label:       'MEM GB',
  },
  net: {
    domain:      [0, 20],
    lineColor:   '#34d399',                    // emerald
    glowColor:   'rgba(52, 211, 153, 0.55)',
    fillTop:     'rgba(52, 211, 153, 0.18)',
    fillBottom:  'rgba(52, 211, 153, 0.00)',
    label:       'NET MB/s',
  },
  latency: {
    domain:      [0, 200],
    lineColor:   '#fb923c',                    // amber-orange
    glowColor:   'rgba(251, 146, 60, 0.55)',
    fillTop:     'rgba(251, 146, 60, 0.18)',
    fillBottom:  'rgba(251, 146, 60, 0.00)',
    label:       'LAT ms',
  },
  sessions: {
    domain:      [0, 2000],
    lineColor:   '#f472b6',                    // pink
    glowColor:   'rgba(244, 114, 182, 0.55)',
    fillTop:     'rgba(244, 114, 182, 0.18)',
    fillBottom:  'rgba(244, 114, 182, 0.00)',
    label:       'SESS',
  },
}
const toY = (value, domainMin, domainMax, drawHeight, padTop, padBottom) => {
  const clamped  = Math.max(domainMin, Math.min(domainMax, value))
  const fraction = (clamped - domainMin) / (domainMax - domainMin)
  return padTop + (1 - fraction) * drawHeight
}
const buildPoints = (data, metricKey, config, w, h) => {
  const { domain } = config
  const drawH = h - PADDING_TOP - PADDING_BOTTOM
  const n     = data.length
  if (n === 0) return []
  return data.map((d, i) => ({
    x: PADDING_X + (i / Math.max(n - 1, 1)) * (w - PADDING_X * 2),
    y: toY(d[metricKey] ?? 0, domain[0], domain[1], drawH, PADDING_TOP, PADDING_BOTTOM),
  }))
}
const cardinalControlPoints = (pts, i, tension) => {
  const p0 = pts[Math.max(i - 1, 0)]
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = pts[Math.min(i + 2, pts.length - 1)]

  return {
    cp1x: p1.x + (p2.x - p0.x) * tension,
    cp1y: p1.y + (p2.y - p0.y) * tension,
    cp2x: p2.x - (p3.x - p1.x) * tension,
    cp2y: p2.y - (p3.y - p1.y) * tension,
  }
}
const drawSparkline = (ctx, points, config, w, h) => {
  if (points.length < 2) return

  const { lineColor, glowColor, fillTop, fillBottom } = config
  const baseline = h - PADDING_BOTTOM
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 0; i < points.length - 1; i++) {
    const { cp1x, cp1y, cp2x, cp2y } = cardinalControlPoints(points, i, TENSION)
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[i + 1].x, points[i + 1].y)
  }
  const fillPath = new Path2D(ctx)   // capture the open line path
  // close fill shape down to baseline
  ctx.lineTo(points[points.length - 1].x, baseline)
  ctx.lineTo(points[0].x, baseline)
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, PADDING_TOP, 0, baseline)
  grad.addColorStop(0,   fillTop)
  grad.addColorStop(1,   fillBottom)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 0; i < points.length - 1; i++) {
    const { cp1x, cp1y, cp2x, cp2y } = cardinalControlPoints(points, i, TENSION)
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[i + 1].x, points[i + 1].y)
  }
  ctx.strokeStyle  = glowColor
  ctx.lineWidth    = LINE_WIDTH + 3
  ctx.lineCap      = 'round'
  ctx.lineJoin     = 'round'
  ctx.shadowBlur   = GLOW_BLUR * 2
  ctx.shadowColor  = glowColor
  ctx.stroke()
  ctx.shadowBlur   = 0
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 0; i < points.length - 1; i++) {
    const { cp1x, cp1y, cp2x, cp2y } = cardinalControlPoints(points, i, TENSION)
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[i + 1].x, points[i + 1].y)
  }
  ctx.strokeStyle = lineColor
  ctx.lineWidth   = LINE_WIDTH
  ctx.shadowBlur  = GLOW_BLUR
  ctx.shadowColor = glowColor
  ctx.stroke()
  ctx.shadowBlur  = 0
  const last = points[points.length - 1]
  ctx.beginPath()
  ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2)
  ctx.fillStyle  = lineColor
  ctx.shadowBlur = 8
  ctx.shadowColor = glowColor
  ctx.fill()
  ctx.shadowBlur = 0
}
const drawIdleWave = (ctx, config, w, h, t) => {
  const { lineColor, glowColor, fillTop, fillBottom } = config
  const midY     = h / 2
  const amp      = h * IDLE_AMPLITUDE
  const baseline = h - PADDING_BOTTOM
  const steps    = 80

  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const x    = (i / steps) * w
    const phase = (i / steps) * Math.PI * 4 - t * IDLE_SPEED
    const y    = midY + Math.sin(phase) * amp * Math.sin((i / steps) * Math.PI)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.lineTo(w, baseline)
  ctx.lineTo(0, baseline)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, midY - amp, 0, baseline)
  grad.addColorStop(0,   fillTop)
  grad.addColorStop(1,   fillBottom)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const x    = (i / steps) * w
    const phase = (i / steps) * Math.PI * 4 - t * IDLE_SPEED
    const y    = midY + Math.sin(phase) * amp * Math.sin((i / steps) * Math.PI)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.strokeStyle = `${lineColor}55`
  ctx.lineWidth   = LINE_WIDTH
  ctx.shadowBlur  = GLOW_BLUR
  ctx.shadowColor = glowColor
  ctx.stroke()
  ctx.shadowBlur  = 0
}
export default function MetricChart({
  metrics    = [],
  metricKey  = 'cpu',
  maxPoints  = DEFAULT_MAX_POINTS,
  animated   = true,
}) {
  const canvasRef   = useRef(null)
  const rafRef      = useRef(null)       // pending animation frame id
  const dirtyRef    = useRef(true)       // true = needs redraw
  const idleTimeRef = useRef(0)          // ms timestamp for idle wave
  const idleRafRef  = useRef(null)       // separate RAF for idle animation
  const historyRef  = useRef([])
  useEffect(() => {
    if (Array.isArray(metrics)) {
      historyRef.current = metrics.slice(-maxPoints)
    } else if (metrics && typeof metrics === 'object' && metrics.ts) {
      const buf = historyRef.current
      if (buf.length === 0 || buf[buf.length - 1].ts !== metrics.ts) {
        buf.push(metrics)
        if (buf.length > maxPoints) buf.shift()
      }
    }
    dirtyRef.current = true
  }, [metrics, maxPoints])
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr    = window.devicePixelRatio || 1
    const rect   = canvas.getBoundingClientRect()
    const w      = Math.round(rect.width  * dpr)
    const h      = Math.round(rect.height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      dirtyRef.current = true
    }
  }, [])
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    const dpr    = window.devicePixelRatio || 1
    const w      = canvas.width  / dpr
    const h      = canvas.height / dpr
    const config = METRIC_CONFIG[metricKey] ?? METRIC_CONFIG.cpu
    const data   = historyRef.current

    ctx.clearRect(0, 0, w, h)

    if (data.length < 2) {
      if (animated) {
        drawIdleWave(ctx, config, w, h, idleTimeRef.current)
      }
      return
    }

    const points = buildPoints(data, metricKey, config, w, h)
    drawSparkline(ctx, points, config, w, h)
  }, [metricKey, animated])
  useEffect(() => {
    if (!dirtyRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      resizeCanvas()
      paint()
      dirtyRef.current = false
    })
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [metrics, metricKey, resizeCanvas, paint])
  useEffect(() => {
    if (!animated) return

    const shouldAnimate = () =>
      !historyRef.current || historyRef.current.length < 2

    const idleLoop = (ts) => {
      if (!shouldAnimate()) {
        idleRafRef.current = null
        return
      }
      idleTimeRef.current = ts
      resizeCanvas()
      paint()
      idleRafRef.current = requestAnimationFrame(idleLoop)
    }

    if (shouldAnimate()) {
      idleRafRef.current = requestAnimationFrame(idleLoop)
    }

    return () => {
      if (idleRafRef.current) cancelAnimationFrame(idleRafRef.current)
    }
  }, [animated, resizeCanvas, paint])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => {
      dirtyRef.current = true
      resizeCanvas()
      paint()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [resizeCanvas, paint])

  return (
    <canvas
      ref={canvasRef}
      aria-label={`${METRIC_CONFIG[metricKey]?.label ?? metricKey} sparkline`}
      role="img"
      style={{
        display:    'block',
        width:      '100%',
        height:     '100%',
        background: 'transparent',
      }}
    />
  )
}
