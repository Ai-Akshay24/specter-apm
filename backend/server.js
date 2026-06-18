import { createServer }  from 'http'
import express           from 'express'
import { Server }        from 'socket.io'
import { registerSocketHandlers } from './socket.js'
import { startEngine }   from './engine.js'
const PORT             = process.env.PORT ?? 4000
const CLIENT_ORIGIN    = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
const app = express()
app.use(express.json())
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now(), uptime: process.uptime() })
})
app.get('/api/servers', (_req, res) => {
  res.json({ servers: SERVER_TOPOLOGY })
})
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin:  CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
  transports:           ['websocket'],
  pingTimeout:          10_000,
  pingInterval:         5_000,
  // Prevent memory leaks from never-completing handshakes
  connectTimeout:       8_000,
})
registerSocketHandlers(io)
let stopEngine = () => {}

httpServer.listen(PORT, async () => {
  console.log('┌─────────────────────────────────────────┐')
  console.log('│  Specter APM backend                    │')
  console.log(`│  HTTP  →  http://localhost:${PORT}         │`)
  console.log(`│  WS    →  ws://localhost:${PORT}           │`)
  console.log(`│  CORS  →  ${CLIENT_ORIGIN}  │`)
  console.log('└─────────────────────────────────────────┘')

  stopEngine = await startEngine(io)
})

const shutdown = (signal) => {
  console.log(`\n[Specter] ${signal} received — shutting down gracefully…`)
  stopEngine()
  io.close(() => {
    httpServer.close(() => {
      console.log('[Specter] HTTP server closed.  Bye.')
      process.exit(0)
    })
  })
  setTimeout(() => process.exit(1), 5_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

const SERVER_TOPOLOGY = [
  {
    id:       'srv-001',
    label:    'US-EAST-DB-01',
    region:   'us-east-1',
    ip:       '10.0.1.11',
    status:   'operational',
    tags:     ['database', 'primary'],
    topology: { x: 0.50, y: 0.14 },
  },
  {
    id:       'srv-002',
    label:    'US-EAST-APP-01',
    region:   'us-east-1',
    ip:       '10.0.1.21',
    status:   'operational',
    tags:     ['app', 'api'],
    topology: { x: 0.76, y: 0.30 },
  },
  {
    id:       'srv-003',
    label:    'EU-WEST-APP-01',
    region:   'eu-west-1',
    ip:       '10.0.2.21',
    status:   'warning',
    tags:     ['app', 'cdn'],
    topology: { x: 0.76, y: 0.62 },
  },
  {
    id:       'srv-004',
    label:    'US-WEST-CACHE-01',
    region:   'us-west-2',
    ip:       '10.0.3.11',
    status:   'operational',
    tags:     ['cache', 'redis'],
    topology: { x: 0.50, y: 0.78 },
  },
  {
    id:       'srv-005',
    label:    'AP-SOUTH-APP-01',
    region:   'ap-south-1',
    ip:       '10.0.4.21',
    status:   'critical',
    tags:     ['app', 'secondary'],
    topology: { x: 0.24, y: 0.62 },
  },
  {
    id:       'srv-006',
    label:    'US-EAST-LB-01',
    region:   'us-east-1',
    ip:       '10.0.1.5',
    status:   'operational',
    tags:     ['load-balancer'],
    topology: { x: 0.24, y: 0.30 },
  },
]
