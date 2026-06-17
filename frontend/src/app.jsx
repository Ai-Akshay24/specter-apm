import { useState, useCallback } from 'react'
import SpotlightCanvas from './components/SpotlightCanvas'
import ServerNode      from './components/ServerNode'
const MOCK_SERVERS = [
  {
    id:      'srv-001',
    label:   'US-EAST-DB-01',
    region:  'us-east-1',
    ip:      '10.0.1.11',
    status:  'operational',   // 'operational' | 'warning' | 'critical' | 'offline'
    tags:    ['database', 'primary'],
    topology: { x: 0.50, y: 0.24 },
  },
  {
    id:      'srv-002',
    label:   'US-EAST-APP-01',
    region:  'us-east-1',
    ip:      '10.0.1.21',
    status:  'operational',
    tags:    ['app', 'api'],
    topology: { x: 0.20, y: 0.32 },
  },
  {
    id:      'srv-003',
    label:   'EU-WEST-APP-01',
    region:  'eu-west-1',
    ip:      '10.0.2.21',
    status:  'warning',
    tags:    ['app', 'cdn'],
    topology: { x: 0.80, y: 0.32 },
  },
  {
    id:      'srv-004',
    label:   'US-WEST-CACHE-01',
    region:  'us-west-2',
    ip:      '10.0.3.11',
    status:  'operational',
    tags:    ['cache', 'redis'],
    topology: { x: 0.20, y: 0.68 },
  },
  {
    id:      'srv-005',
    label:   'AP-SOUTH-APP-01',
    region:  'ap-south-1',
    ip:      '10.0.4.21',
    status:  'critical',
    tags:    ['app', 'secondary'],
    topology: { x: 0.80, y: 0.68 },
  },
  {
    id:      'srv-006',
    label:   'US-EAST-LB-01',
    region:  'us-east-1',
    ip:      '10.0.1.5',
    status:  'operational',
    tags:    ['load-balancer'],
    topology: { x: 0.50, y: 0.76},
  },
]
const seedMetrics = (serverId) => ({
  serverId,
  ts:       Date.now(),
  cpu:      Math.round(20 + Math.random() * 55),
  mem:      parseFloat((40 + Math.random() * 80).toFixed(1)),
  net:      parseFloat((1  + Math.random() * 12).toFixed(2)),
  latency:  Math.round(8  + Math.random() * 60),
  sessions: Math.round(800 + Math.random() * 600),
})
 
const MOCK_TELEMETRY = Object.fromEntries(
  MOCK_SERVERS.map((s) => [s.id, seedMetrics(s.id)])
)
const STATUS_DOT = {
  operational: { color: '#22c55e', label: 'OPERATIONAL' },
  warning:     { color: '#f59e0b', label: 'DEGRADED'    },
  critical:    { color: '#ef4444', label: 'CRITICAL'    },
  offline:     { color: '#6b7280', label: 'OFFLINE'     },
}
 
const NAV_ITEMS = [
  { icon: '⬡',  label: 'Dashboard', active: true  },
  { icon: '◎',  label: 'Alert Logs', active: false },
  { icon: '⬢',  label: 'System Map', active: false },
  { icon: '⚙',  label: 'Settings',   active: false },
]
export default function App() {
  const [activeId, setActiveId] = useState(null)
  const telemetry = MOCK_TELEMETRY
 
  const handleNodeFocus = useCallback((id) => {
    setActiveId((prev) => (prev === id ? null : id))
  }, [])
  const systemStatus = MOCK_SERVERS.some((s) => s.status === 'critical')
    ? 'critical'
    : MOCK_SERVERS.some((s) => s.status === 'warning')
    ? 'warning'
    : 'operational'
 
  const alertCount = MOCK_SERVERS.filter(
    (s) => s.status === 'warning' || s.status === 'critical'
  ).length
  const topologyNodes = MOCK_SERVERS.map((s) => s.topology)
 
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
          <div style={styles.userAvatar} aria-label="User profile">SP</div>
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
            {/* System status pill */}
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
 
            {/* Alert count pill */}
            {alertCount > 0 && (
              <div style={{ ...styles.statusPill, ...styles.alertPill }}>
                <span style={styles.alertIcon} aria-hidden="true">⚠</span>
                <span style={styles.statusLabel}>
                  OPEN ALERTS:{' '}
                  <strong style={{ color: '#ef4444' }}>{alertCount}</strong>
                </span>
              </div>
            )}
 
            {/* Live clock — static for mock; replace with useClock() hook */}
            <time style={styles.clock} dateTime={new Date().toISOString()}>
              {new Date().toLocaleString('en-US', {
                month:   '2-digit',
                day:     '2-digit',
                year:    'numeric',
                hour:    '2-digit',
                minute:  '2-digit',
                second:  '2-digit',
                hour12:  false,
                timeZoneName: 'short',
              })}
            </time>
          </div>
        </header>
 
        {/* ── topology canvas stage — server nodes float here ── */}
        <section
          style={styles.stage}
          aria-label="Server topology map"
        >
          {MOCK_SERVERS.map((server) => {
            const { x, y } = server.topology
            return (
              <div
                key={server.id}
                style={{
                  ...styles.nodeWrapper,
                  left:      `${x * 100}%`,
                  top:       `${y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <ServerNode
                  server={server}
                  metrics={telemetry[server.id]}
                  isActive={activeId === server.id}
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
    position:        'relative',
    zIndex:          20,
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    width:           '72px',
    flexShrink:      0,
    padding:         '20px 0',
    background:      'rgba(3, 7, 18, 0.85)',
    backdropFilter:  'blur(12px)',
    borderRight:     '1px solid rgba(56, 189, 248, 0.08)',
  },
  sidebarLogo: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '4px',
    marginBottom:    '32px',
  },
  logoMark: {
    fontSize:        '22px',
    color:           '#38bdf8',
    lineHeight:      1,
    filter:          'drop-shadow(0 0 6px rgba(56,189,248,0.6))',
  },
  logoText: {
    fontSize:        '8px',
    fontWeight:      700,
    letterSpacing:   '0.15em',
    color:           'rgba(56,189,248,0.55)',
  },
  navList: {
    listStyle:  'none',
    margin:     0,
    padding:    0,
    flex:       1,
    display:    'flex',
    flexDirection: 'column',
    gap:        '4px',
    width:      '100%',
    alignItems: 'center',
  },
  navItem: {
    position:        'relative',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '5px',
    width:           '52px',
    padding:         '10px 4px',
    border:          'none',
    borderRadius:    '10px',
    background:      'transparent',
    color:           'rgba(148,163,184,0.6)',
    cursor:          'pointer',
    fontSize:        '10px',
    fontFamily:      'inherit',
    letterSpacing:   '0.04em',
    transition:      'color 0.2s, background 0.2s',
  },
  navItemActive: {
    color:           '#38bdf8',
    background:      'rgba(56,189,248,0.08)',
  },
  navIcon: {
    fontSize: '18px',
    lineHeight: 1,
  },
  navLabel: {
    fontSize:    '8px',
    fontWeight:  600,
    letterSpacing: '0.06em',
    textAlign:   'center',
  },
  navActivePip: {
    position:        'absolute',
    left:            0,
    top:             '50%',
    transform:       'translateY(-50%)',
    width:           '3px',
    height:          '24px',
    borderRadius:    '0 3px 3px 0',
    background:      '#38bdf8',
    boxShadow:       '0 0 8px rgba(56,189,248,0.8)',
  },
  sidebarFooter: {
    marginTop:  'auto',
    paddingTop: '16px',
  },
  userAvatar: {
    width:           '36px',
    height:          '36px',
    borderRadius:    '50%',
    background:      'rgba(56,189,248,0.15)',
    border:          '1.5px solid rgba(56,189,248,0.3)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '11px',
    fontWeight:      700,
    color:           '#38bdf8',
    letterSpacing:   '0.05em',
    cursor:          'pointer',
  },
  main: {
    position:      'relative',
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
    zIndex:        10,
  },
  topBar: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '12px 24px',
    background:     'rgba(3,7,18,0.6)',
    backdropFilter: 'blur(8px)',
    borderBottom:   '1px solid rgba(56,189,248,0.06)',
    flexShrink:     0,
    zIndex:         20,
  },
  topBarLeft: {},
  topBarRight: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
  },
  pageTitle: {
    margin:        0,
    fontSize:      '11px',
    fontWeight:    700,
    letterSpacing: '0.18em',
    color:         'rgba(148,163,184,0.7)',
  },
  statusPill: {
    display:      'flex',
    alignItems:   'center',
    gap:          '7px',
    padding:      '5px 12px',
    borderRadius: '6px',
    background:   'rgba(15,23,42,0.7)',
    border:       '1px solid rgba(56,189,248,0.1)',
    backdropFilter: 'blur(6px)',
  },
  alertPill: {
    border: '1px solid rgba(239,68,68,0.2)',
  },
  statusDot: {
    width:        '7px',
    height:       '7px',
    borderRadius: '50%',
    flexShrink:   0,
  },
  statusLabel: {
    fontSize:      '10px',
    fontWeight:    500,
    letterSpacing: '0.08em',
    color:         'rgba(148,163,184,0.8)',
    whiteSpace:    'nowrap',
  },
  alertIcon: {
    fontSize: '11px',
    color:    '#ef4444',
    filter:   'drop-shadow(0 0 4px rgba(239,68,68,0.6))',
  },
  clock: {
    fontSize:      '11px',
    fontFamily:    "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
    color:         'rgba(148,163,184,0.5)',
    letterSpacing: '0.06em',
    whiteSpace:    'nowrap',
  },
  stage: {
  position: 'relative',
  width: '100%',
  height: '100vh',
  padding: '80px 40px 60px 260px', // Top, Right, Bottom, Left (260px accounts for your sidebar!)
  boxSizing: 'border-box',
  overflow: 'hidden',
  },
  nodeWrapper: {
    position: 'absolute',
    zIndex:   10,
  },
}
 