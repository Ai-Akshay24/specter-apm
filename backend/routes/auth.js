import { Router }        from 'express'
import { Organization }  from '../models/Organization.js'
import { User }          from '../models/User.js'
import { Server }        from '../models/Server.js'
import { signAccessToken } from '../middleware/auth.js'

const router = Router()

const isValidEmail    = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const slugify         = (v) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const DEFAULT_TOPOLOGY = [
  { serverId: 'srv-001', label: 'US-EAST-DB-01',     region: 'us-east-1',  ip: '10.0.1.11', tags: ['database', 'primary'],   topology: { x: 0.50, y: 0.14 } },
  { serverId: 'srv-002', label: 'US-EAST-APP-01',    region: 'us-east-1',  ip: '10.0.1.21', tags: ['app', 'api'],            topology: { x: 0.76, y: 0.30 } },
  { serverId: 'srv-003', label: 'EU-WEST-APP-01',    region: 'eu-west-1',  ip: '10.0.2.21', tags: ['app', 'cdn'],            topology: { x: 0.76, y: 0.62 } },
  { serverId: 'srv-004', label: 'US-WEST-CACHE-01',  region: 'us-west-2',  ip: '10.0.3.11', tags: ['cache', 'redis'],        topology: { x: 0.50, y: 0.78 } },
  { serverId: 'srv-005', label: 'AP-SOUTH-APP-01',   region: 'ap-south-1', ip: '10.0.4.21', tags: ['app', 'secondary'],      topology: { x: 0.24, y: 0.62 } },
  { serverId: 'srv-006', label: 'US-EAST-LB-01',     region: 'us-east-1',  ip: '10.0.1.5',  tags: ['load-balancer'],         topology: { x: 0.24, y: 0.30 } },
]

router.post('/register', async (req, res) => {
  const { email, password, name, orgName } = req.body ?? {}

  // ── validation ────────────────────────────────────────────────────────────
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' })
  }
  if (!orgName || !orgName.trim()) {
    return res.status(400).json({ error: 'Organization name is required.' })
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() })
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' })
  }

  let createdOrg = null
  let createdUser = null

  try {
    const slug = `${slugify(orgName)}-${Math.random().toString(36).slice(2, 7)}`
    createdOrg = await Organization.create({
      name: orgName.trim(),
      slug,
      plan: 'free',
    })

    createdUser = await User.register({
      email,
      password,    // plaintext in; hashed by the pre-save hook
      name:  name.trim(),
      orgId: createdOrg._id,
      role:  'owner',
    })

    await Server.insertMany(
      DEFAULT_TOPOLOGY.map((s) => ({ ...s, orgId: createdOrg._id }))
    )

    const token = signAccessToken(createdUser)

    return res.status(201).json({
      token,
      user: createdUser.toSafeJSON(),
      org: {
        id:   createdOrg._id,
        name: createdOrg.name,
        slug: createdOrg.slug,
        plan: createdOrg.plan,
      },
    })

  } catch (err) {
    // ── rollback: don't leave an orphaned Org or User on partial failure ────
    console.error('[auth] Registration failed, rolling back:', err.message)
    if (createdUser)  await User.deleteOne({ _id: createdUser._id }).catch(() => {})
    if (createdOrg)   await Organization.deleteOne({ _id: createdOrg._id }).catch(() => {})
    await Server.deleteMany({ orgId: createdOrg?._id }).catch(() => {})

    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }
    return res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }
  const user = await User.findByEmailWithPassword(email)

  // Constant-shape response whether the user exists or not — avoids
  // leaking which emails are registered via response timing/content.
  const invalidCredentials = () =>
    res.status(401).json({ error: 'Invalid email or password.' })

  if (!user) return invalidCredentials()
  if (!user.isActive) {
    return res.status(403).json({ error: 'This account has been deactivated.' })
  }

  const passwordMatches = await user.comparePassword(password)
  if (!passwordMatches) return invalidCredentials()

  user.lastLoginAt = new Date()
  await user.save()

  const token = signAccessToken(user)

  return res.json({
    token,
    user: user.toSafeJSON(),
  })
})

export default router