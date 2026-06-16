import { useEffect, useRef, useCallback } from 'react'
const LERP_FACTOR      = 0.085   // 0 = no movement, 1 = instant snap
const SPOTLIGHT_RADIUS = 220     // px — area revealed by flashlight
const GRID_SPACING     = 40      // px — dot grid cell size
const WIRE_WIDTH       = 1.2     // px — base connection line width
const WIRE_GLOW_WIDTH  = 6       // px — glow halo width at peak illumination
 
const COLORS = {
  dotBase:      'rgba(56, 189, 248, 0.06)',   // dim grid dot
  dotLit:       'rgba(56, 189, 248, 0.55)',   // grid dot inside spotlight
  dotRadius:    2.2,                          // px — dot circle radius
  wireBase:     'rgba(56, 189, 248, 0.04)',   // wire outside spotlight
  wireLit:      'rgba(56, 189, 248, 0.75)',   // wire stroke at hotspot
  wireGlow:     'rgba(56, 189, 248, 0.18)',   // wire glow halo colour
  spotInner:    'rgba(56, 189, 248, 0.07)',   // spotlight centre fill
  spotOuter:    'rgba(56, 189, 248, 0.00)',   // spotlight edge fade
  background:   '#030712',                   // canvas clear colour
}
const lerp = (a, b, t) => a + (b - a) * t
 
const buildWirePath = (ax, ay, bx, by, seed) => {
  const mx  = (ax + bx) / 2
  const my  = (ay + by) / 2
  const dx  = bx - ax
  const dy  = by - ay
  const len = Math.hypot(dx, dy)
  const nx  = -dy / len   // normal vector
  const ny  =  dx / len
  const bow = (((seed * 137.508) % 1) - 0.5) * len * 0.38
  return {
    cp1x: mx + nx * bow * 0.6,
    cp1y: my + ny * bow * 0.6,
    cp2x: mx + nx * bow * 1.0,
    cp2y: my + ny * bow * 1.0,
  }
}
export default function SpotlightCanvas({ nodes = [], radius = SPOTLIGHT_RADIUS, gridSpacing = GRID_SPACING }) {
  const canvasRef  = useRef(null)
  const rafIdRef   = useRef(null)
  const mouseRef   = useRef({ x: -999, y: -999 })   // raw target
  const spotRef    = useRef({ x: -999, y: -999 })   // lerped current position
  const sizeRef    = useRef({ w: 0, h: 0 })
  const enteredRef = useRef(false)                   // has mouse ever entered?
 
  const wiresRef   = useRef([])
 
  useEffect(() => {
    const wires = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (dist < 0.35) {
          wires.push({ a, b, seed: (i * 13 + j * 7) / 100 })
        }
      }
    }
    wiresRef.current = wires
  }, [nodes])
 
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w   = window.innerWidth
    const h   = window.innerHeight
    canvas.width  = w * dpr
    canvas.height = h * dpr
    canvas.style.width  = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    sizeRef.current = { w, h }
  }, [])
 
  const handleMouseMove = useCallback((e) => {
    mouseRef.current.x = e.clientX
    mouseRef.current.y = e.clientY
    if (!enteredRef.current) {
      spotRef.current.x  = e.clientX
      spotRef.current.y  = e.clientY
      enteredRef.current = true
    }
  }, [])
 
  const handleMouseLeave = useCallback(() => {
    mouseRef.current.x = -999
    mouseRef.current.y = -999
    enteredRef.current = false
  }, [])
 
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx   = canvas.getContext('2d')
    const { w, h } = sizeRef.current
    const mx    = mouseRef.current.x
    const my    = mouseRef.current.y
 
    spotRef.current.x = lerp(spotRef.current.x, mx, LERP_FACTOR)
    spotRef.current.y = lerp(spotRef.current.y, my, LERP_FACTOR)
    const sx = spotRef.current.x
    const sy = spotRef.current.y
 
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, w, h)
 
    const r2 = radius * radius
 
    const cols = Math.ceil(w / gridSpacing) + 1
    const rows = Math.ceil(h / gridSpacing) + 1
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const gx  = c * gridSpacing
        const gy  = r * gridSpacing
        const dx  = gx - sx
        const dy  = gy - sy
        const d2  = dx * dx + dy * dy
        const lit = d2 < r2
 
        ctx.beginPath()
        ctx.arc(gx, gy, COLORS.dotRadius, 0, Math.PI * 2)
 
        if (lit) {
          const falloff = 1 - Math.sqrt(d2) / radius
          const alpha   = 0.08 + falloff * 0.55
          ctx.fillStyle = `rgba(56,189,248,${alpha.toFixed(3)})`
        } else {
          ctx.fillStyle = COLORS.dotBase
        }
        ctx.fill()
      }
    }
    const wires = wiresRef.current
    for (let i = 0; i < wires.length; i++) {
      const { a, b, seed } = wires[i]
      const ax = a.x * w
      const ay = a.y * h
      const bx = b.x * w
      const by = b.y * h
      const mid = { x: (ax + bx) / 2, y: (ay + by) / 2 }
      const dm2 = (mid.x - sx) ** 2 + (mid.y - sy) ** 2
      const lit = dm2 < r2
 
      const { cp1x, cp1y, cp2x, cp2y } = buildWirePath(ax, ay, bx, by, seed)
 
      if (lit) {
        const falloff  = 1 - Math.sqrt(dm2) / radius
        const alpha    = 0.12 + falloff * 0.70
 
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, by)
        ctx.strokeStyle = COLORS.wireGlow
        ctx.lineWidth   = WIRE_GLOW_WIDTH * falloff
        ctx.lineCap     = 'round'
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, by)
        ctx.strokeStyle = `rgba(56,189,248,${alpha.toFixed(3)})`
        ctx.lineWidth   = WIRE_WIDTH + falloff * 1.2
        ctx.lineCap     = 'round'
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, by)
        ctx.strokeStyle = COLORS.wireBase
        ctx.lineWidth   = WIRE_WIDTH
        ctx.lineCap     = 'round'
        ctx.stroke()
      }
    }
    if (sx > 0) {
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius)
      grad.addColorStop(0,    COLORS.spotInner)
      grad.addColorStop(0.35, 'rgba(56,189,248,0.04)')
      grad.addColorStop(1,    COLORS.spotOuter)
 
      ctx.globalCompositeOperation = 'lighter'
      ctx.beginPath()
      ctx.arc(sx, sy, radius, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  }, [radius, gridSpacing])
  useEffect(() => {
    const loop = () => {
      draw()
      rafIdRef.current = requestAnimationFrame(loop)
    }
 
    handleResize()
    window.addEventListener('resize',     handleResize,    { passive: true })
    window.addEventListener('mousemove',  handleMouseMove, { passive: true })
    window.addEventListener('mouseleave', handleMouseLeave)
 
    rafIdRef.current = requestAnimationFrame(loop)
 
    return () => {
      cancelAnimationFrame(rafIdRef.current)
      window.removeEventListener('resize',     handleResize)
      window.removeEventListener('mousemove',  handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [draw, handleResize, handleMouseMove, handleMouseLeave])
 
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position:         'fixed',
        inset:            0,
        zIndex:           0,
        pointerEvents:    'none',  // never intercepts clicks
        display:          'block',
        willChange:       'transform',  // promotes to GPU compositor layer
      }}
    />
  )
}