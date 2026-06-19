import { verifySocketToken } from './middleware/auth.js'
import { addActiveOrg, removeActiveOrg } from './engine.js'

export const registerSocketHandlers = (io) => {
  // 1. SECURITY MIDDLEWARE: Verify the JWT before letting them connect
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error('Authentication error: Token required'))
      
      const payload = verifySocketToken(token)
      socket.user = payload // Attaches { sub, orgId, role } to the socket
      next()
    } catch (err) {
      next(new Error('Authentication error: Invalid token'))
    }
  })

  // 2. CONNECTION LOGIC: Add them to the roster
  io.on('connection', (socket) => {
    const orgId = socket.user.orgId
    
    console.log(`[socket] ✅ Client connected  org=${orgId} id=${socket.id}`)
    
    // Tell the engine to start saving data for this organization
    addActiveOrg(orgId)
    socket.join(orgId) 

    // 3. DISCONNECT LOGIC: Remove them from the roster
    socket.on('disconnect', () => {
      console.log(`[socket] ❌ Client disconnected org=${orgId} id=${socket.id}`)
      
      // If this was the last browser tab closed for this org, tell engine to stop saving
      const room = io.sockets.adapter.rooms.get(orgId)
      if (!room || room.size === 0) {
        removeActiveOrg(orgId)
      }
    })
  })
}