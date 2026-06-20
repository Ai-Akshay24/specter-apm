/**
 * App.jsx  —  Specter APM
 *
 * Now acts as the application's traffic controller:
 *   1. On mount, checks localStorage for an existing JWT.
 *   2. If absent → renders <AuthScreen> (login/register gateway).
 *   3. If present → instantiates the authenticated Socket.io connection
 *      and renders the main dashboard.
 *   4. The Socket.io client is created ONCE per login session (not per
 *      render) and is torn down cleanly on logout.
 *
 * ─── Socket auth handshake ────────────────────────────────────────────────────
 * The token is passed via the `auth` option on `io()`, which Socket.io
 * forwards to the server as `socket.handshake.auth.token`. The backend's
 * `verifySocketToken()` (middleware/auth.js) reads it during the
 * `io.use()` middleware step — see socket.js for the server-side check.
 *
 * Socket event contract (must match engine.js + socket.js output):
 *   event name : 'telemetry:batch'
 *   payload    : { ts: Number, servers: ServerMetric[] }
 *   ServerMetric: { serverId, ts, cpu, mem, net, latency, sessions }
 */

import { useState, useCallback, useEffect } from 'react'
import { io }            from 'socket.io-client'
import SpotlightCanvas    from './components/SpotlightCanvas'
import ServerNode         from './components/ServerNode'
import AuthScreen         from './components/AuthScreen'
import  useTelemetry    from './hooks/useTelemetry'

const SOCKET_URL = 'http://localhost:4000'
const TOKEN_KEY   = 'specter_token'
const USER_KEY    = 'specter_user'

// ─── status indicator config ──────────────────────────────────────────────────
const STATUS_DOT = {
  operational: { color: '#22c55e', label: 'OPERATIONAL' },
  warning:     { color: '#f59e0b', label: 'DEGRADED'    },
  critical:    { color: '#ef4444', label: 'CRITICAL'    },
  offline:     { color: '#6b7280', label: 'OFFLINE'     },
}

const NAV_ITEMS = [
  { icon: '⬡', label: 'Dashboard',  active: true  },
  { icon: '◎', label: 'Alert Logs', active: false },
  { icon: '⬢', label: 'System Map', active: false },
  { icon: '⚙', label: 'Settings',   active: false },
]

// ─── component ───────────────────────────────────────────────────────────────
export default function App() {
  // ── auth state ──────────────────────────────────────────────────────────
  // Initialised synchronously from localStorage so there's no flash of the
  // auth screen for an already-logged-in user on refresh.
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user,  setUser]  = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  // ── socket instance — created once per authenticated session ──────────────
  const [socket, setSocket]   = useState(null)
  const [servers, setServers] = useState([])   // hydrated from GET /api/servers
  const [activeId, setActiveId] = useState(null)

  // ── handle successful login/register from AuthScreen ──────────────────────
  const handleAuthenticated = useCallback((newToken, newUser) => {
    setToken(newToken)
    setUser(newUser)
  }, [])

  // ── logout ──────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    socket?.disconnect()
    setSocket(null)
    setServers([])
    setToken(null)
    setUser(null)
  }, [socket])

  // ── instantiate the authenticated socket whenever `token` changes ─────────
  useEffect(() => {
    if (!token) return undefined

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      // The JWT travels here — the server reads it from
      // socket.handshake.auth.token during the io.use() middleware step.
      auth: { token },
    })

    newSocket.on('connection:ack', (payload) => {
      console.log('[socket] connected:', payload.message)
    })

    newSocket.on('connect_error', (err) => {
      console.error('[socket] connect_error:', err.message)
      // A rejected handshake (expired/invalid token) lands here.
      // Auto-logout so the user is dropped back to AuthScreen rather than
      // staring at a dashboard with no live data.
      if (err.message?.toLowerCase().includes('token') || err.message?.toLowerCase().includes('auth')) {
        handleLogout()
      }
    })

    setSocket(newSocket)

    // tell the server we're ready (optional handshake — see socket.js)
    newSocket.emit('client:ready', { ts: Date.now() })

    return () => {
      newSocket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── fetch this org's server topology once authenticated ───────────────────
  useEffect(() => {
    if (!token) return
    let cancelled = false

    fetch(`${SOCKET_URL}/api/servers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load servers (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setServers(data.servers ?? [])
      })
      .catch((err) => {
        console.error('[App] Failed to fetch server topology:', err.message)
      })

    return () => { cancelled = true }
  }, [token])

  // ── live telemetry — keyed by serverId, ring-buffer history under the hood ─
  const telemetry = useTelemetry(socket)

  const handleNodeFocus = useCallback((id) => {
    setActiveId((prev) => (prev === id ? null : id))
  }, [])

  // ── derive system-wide status from the worst individual server ────────────
  const systemStatus = servers.some((sv) => sv.status === 'critical')
    ? 'critical'
    : servers.some((sv) => sv.status === 'warning')
    ? 'warning'
    : 'operational'

  const alertCount = servers.filter(
    (sv) => sv.status === 'warning' || sv.status === 'critical'
  ).length

  const topologyNodes = servers.map((sv) => sv.topology)

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH GATE — render the gateway screen if there's no token
  // ─────────────────────────────────────────────────────────────────────────
  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>

      {/* ── GPU spotlight layer — fixed, full viewport, z: 0 ── */}
      <SpotlightCanvas nodes={topologyNodes} radius={240} />

      {/* ── left sidebar navigation ── */}
      <nav style={styles.sidebar} aria-label="Primary navigation">
        <div style={styles.sidebarLogo}>
          <span style={styles.logoMark}>◈</span>
          <span style={styles.logoText}>SPECTER</span>
        </div>

        <ul style={styles.navList} role="list">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <button
                style={{
                  ...styles.navItem,
                  ...(item.active ? styles.navItemActive : {}),
                }}
                aria-current={item.active ? 'page' : undefined}
              >
                <span style={styles.navIcon}  aria-hidden="true">{item.icon}</span>
                <span style={styles.navLabel}>{item.label}</span>
                {item.active && <span style={styles.navActivePip} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>

        <div style={styles.sidebarFooter}>
          <button
            onClick={handleLogout}
            style={styles.userAvatar}
            aria-label={`Log out (${user?.email ?? 'account'})`}
            title={user?.email}
          >
            {(user?.name ?? 'SP').slice(0, 2).toUpperCase()}
          </button>
        </div>
      </nav>

      {/* ── main content area ── */}
      <main style={styles.main}>

        {/* ── top status bar ── */}
        <header style={styles.topBar}>
          <div style={styles.topBarLeft}>
            <h1 style={styles.pageTitle}>SERVER TOPOLOGY MAP</h1>
          </div>

          <div style={styles.topBarRight}>
            <div style={styles.statusPill}>
              <span
                style={{
                  ...styles.statusDot,
                  backgroundColor: STATUS_DOT[systemStatus].color,
                  boxShadow: `0 0 8px ${STATUS_DOT[systemStatus].color}`,
                }}
                aria-hidden="true"
              />
              <span style={styles.statusLabel}>
                SYSTEM:{' '}
                <strong style={{ color: STATUS_DOT[systemStatus].color }}>
                  {STATUS_DOT[systemStatus].label}
                </strong>
              </span>
            </div>

            {alertCount > 0 && (
              <div style={{ ...styles.statusPill, ...styles.alertPill }}>
                <span style={styles.alertIcon} aria-hidden="true">⚠</span>
                <span style={styles.statusLabel}>
                  OPEN ALERTS:{' '}
                  <strong style={{ color: '#ef4444' }}>{alertCount}</strong>
                </span>
              </div>
            )}

            <span style={styles.orgBadge}>{user?.email}</span>
          </div>
        </header>

        {/* ── topology canvas stage ── */}
        <section style={styles.stage} aria-label="Server topology map">
          {servers.map((server) => {
            const { x, y } = server.topology
            return (
              <div
                key={server.id ?? server.serverId}
                style={{
                  ...styles.nodeWrapper,
                  left:      `clamp(180px, ${x * 100}%, calc(100% - 180px))`,
                  top:       `clamp(140px, ${y * 100}%, calc(100% - 140px))`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <ServerNode
                  server={server}
                  metrics={telemetry[server.serverId ?? server.id]}
                  isActive={activeId === (server.id ?? server.serverId)}
                  onFocus={handleNodeFocus}
                />
              </div>
            )
          })}
        </section>

      </main>
    </div>
  )
}

// ─── styles (unchanged from previous pass, plus orgBadge) ─────────────────────
const styles = {
  root: {
    display:         'flex',
    width:           '100vw',
    height:          '100vh',
    overflow:        'hidden',
    backgroundColor: '#030712',
    fontFamily:      "'Inter', 'JetBrains Mono', ui-monospace, monospace",
    color:           '#e2e8f0',
    position:        'relative',
  },
  sidebar: {
    position: 'relative', zIndex: 20, display: 'flex', flexDirection: 'column',
    alignItems: 'center', width: '72px', flexShrink: 0, padding: '20px 0',
    background: 'rgba(3, 7, 18, 0.85)', backdropFilter: 'blur(12px)',
    borderRight: '1px solid rgba(56, 189, 248, 0.08)',
  },
  sidebarLogo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '32px' },
  logoMark: { fontSize: '22px', color: '#38bdf8', lineHeight: 1, filter: 'drop-shadow(0 0 6px rgba(56,189,248,0.6))' },
  logoText: { fontSize: '8px', fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(56,189,248,0.55)' },
  navList: { listStyle: 'none', margin: 0, padding: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', alignItems: 'center' },
  navItem: {
    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
    width: '52px', padding: '10px 4px', border: 'none', borderRadius: '10px', background: 'transparent',
    color: 'rgba(148,163,184,0.6)', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit',
    letterSpacing: '0.04em', transition: 'color 0.2s, background 0.2s',
  },
  navItemActive: { color: '#38bdf8', background: 'rgba(56,189,248,0.08)' },
  navIcon: { fontSize: '18px', lineHeight: 1 },
  navLabel: { fontSize: '8px', fontWeight: 600, letterSpacing: '0.06em', textAlign: 'center' },
  navActivePip: {
    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
    width: '3px', height: '24px', borderRadius: '0 3px 3px 0', background: '#38bdf8',
    boxShadow: '0 0 8px rgba(56,189,248,0.8)',
  },
  sidebarFooter: { marginTop: 'auto', paddingTop: '16px' },
  userAvatar: {
    width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(56,189,248,0.15)',
    border: '1.5px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em', cursor: 'pointer',
    fontFamily: 'inherit',
  },
  main: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 10 },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px',
    background: 'rgba(3,7,18,0.6)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(56,189,248,0.06)',
    flexShrink: 0, zIndex: 20,
  },
  topBarLeft: {},
  topBarRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  pageTitle: { margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(148,163,184,0.7)' },
  statusPill: {
    display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '6px',
    background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(56,189,248,0.1)', backdropFilter: 'blur(6px)',
  },
  alertPill: { border: '1px solid rgba(239,68,68,0.2)' },
  statusDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  statusLabel: { fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(148,163,184,0.8)', whiteSpace: 'nowrap' },
  alertIcon: { fontSize: '11px', color: '#ef4444', filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.6))' },
  orgBadge: {
    fontSize: '10px', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    color: 'rgba(148,163,184,0.5)', letterSpacing: '0.04em', whiteSpace: 'nowrap',
  },
  stage: { position: 'relative', flex: 1 },
  nodeWrapper: { position: 'absolute', zIndex: 10 },
}

/*
 * ─── INTEGRATION NOTES ────────────────────────────────────────────────────────
 *
 * 1. useTelemetry(socket) — must accept a possibly-null socket and return {}
 *    until the socket connects.  It should listen for 'telemetry:batch' and
 *    key its ring buffer by serverId, exactly matching the payload shape
 *    documented at the top of this file.
 *
 * 2. socket.js server-side — io.use() middleware must call
 *    verifySocketToken(socket.handshake.auth.token) and reject the
 *    connection (next(new Error('...'))) on failure, which surfaces here as
 *    the 'connect_error' event and triggers auto-logout.
 *
 * 3. GET /api/servers — now requires the Authorization header and returns
 *    only the requesting user's org-scoped topology (via requireAuth +
 *    req.auth.orgId on the backend).
 */