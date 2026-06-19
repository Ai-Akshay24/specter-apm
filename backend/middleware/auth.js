import jwt from 'jsonwebtoken'

const JWT_SECRET     = process.env.JWT_SECRET
const ACCESS_TOKEN_TTL = '15m'

if (!JWT_SECRET) {
  // Fail loud at boot, not silently at the first login attempt.
  throw new Error(
    '[auth] JWT_SECRET is not set. Add it to your .env file before starting the server.'
  )
}

/**
 * signAccessToken(user)
 * Issues a short-lived JWT carrying the user's id, org, and role.
 *
 * @param {{ _id: any, orgId: any, role: string }} user
 * @returns {string}
 */
export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub:   user._id.toString(),
      orgId: user.orgId.toString(),
      role:  user.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  )

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.auth = payload   // { sub, orgId, role, iat, exp }
    next()
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expired.'
      : 'Invalid token.'
    return res.status(401).json({ error: message })
  }
}

/**
 * verifySocketToken(token)
 * Same verification logic, exposed for socket.js to use during the
 * Socket.io connection handshake (socket.handshake.auth.token).
 *
 * @param {string} token
 * @returns {{ sub: string, orgId: string, role: string }}
 * @throws if the token is missing, malformed, or expired
 */
export const verifySocketToken = (token) => {
  if (!token) throw new Error('No token provided.')
  return jwt.verify(token, JWT_SECRET)
}