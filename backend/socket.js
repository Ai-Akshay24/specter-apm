/**
 * registerSocketHandlers(io)
 * Attaches all connection and message handlers to the Socket.io server.
 *
 * @param {import('socket.io').Server} io
 */
export const registerSocketHandlers = (io) => {
  io.use((_socket, next) => next())  // passthrough for local dev

  // ── connection handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const clientIp = socket.handshake.address
    console.log('[socket] ✅ Client connected    id=%-24s ip=%s', socket.id, clientIp)
    console.log('[socket]    Total clients: %d', io.engine.clientsCount)
    socket.emit('connection:ack', {
      socketId: socket.id,
      ts:       Date.now(),
      message:  'Connected to Specter APM telemetry stream.',
    })
    socket.on('client:ready', (data) => {
      console.log('[socket] 📡 client:ready from %s — %s',
        socket.id,
        JSON.stringify(data ?? {}).slice(0, 80)
      )
    })

    socket.on('disconnect', (reason) => {
      console.log('[socket] ❌ Client disconnected id=%-24s reason=%s', socket.id, reason)
      console.log('[socket]    Total clients: %d', io.engine.clientsCount)
    })

    socket.on('error', (err) => {
      console.error('[socket] ⚠  Error on %s: %s', socket.id, err.message)
    })
  })

  console.log('[socket] Socket.io handlers registered.')
}
