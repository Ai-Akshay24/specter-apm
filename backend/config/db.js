import mongoose from 'mongoose'

const MAX_RETRIES        = 5
const RETRY_BASE_DELAY_MS = 1000   // doubles each attempt: 1s, 2s, 4s, 8s, 16s

mongoose.connection.on('connected', () => {
  console.log('[db] ✅ MongoDB connected →', mongoose.connection.name)
})
mongoose.connection.on('disconnected', () => {
  console.warn('[db] ⚠  MongoDB disconnected — Mongoose will auto-retry on next op')
})
mongoose.connection.on('reconnected', () => {
  console.log('[db] 🔄 MongoDB reconnected')
})
mongoose.connection.on('error', (err) => {
  console.error('[db] ❌ MongoDB connection error:', err.message)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * connectDB()
 * Connects to MongoDB Atlas with exponential backoff retry, then ensures
 * the `metrics` time-series collection exists with the correct options.
 *
 * @returns {Promise<typeof mongoose>}
 */
export const connectDB = async () => {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error(
      '[db] MONGODB_URI is not set. Add it to your .env file — see config/db.js header comment.'
    )
  }

  let attempt = 0
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(uri, {
        maxPoolSize:                  10,
        serverSelectionTimeoutMS:     8000,
        socketTimeoutMS:              45000,
        // Atlas free tier: keep the connection alive through idle periods
        heartbeatFrequencyMS:         10000,
      })
      break
    } catch (err) {
      attempt++
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
      console.error(
        `[db] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
      )
      if (attempt >= MAX_RETRIES) {
        throw new Error(`[db] Could not connect to MongoDB after ${MAX_RETRIES} attempts.`)
      }
      console.log(`[db] Retrying in ${delay}ms…`)
      await sleep(delay)
    }
  }

  await ensureMetricsTimeSeriesCollection()

  return mongoose
}

const ensureMetricsTimeSeriesCollection = async () => {
  const db = mongoose.connection.db
  const existing = await db.listCollections({ name: 'metrics' }).toArray()

  if (existing.length > 0) {
    console.log('[db] `metrics` time-series collection already exists — skipping creation.')
    return
  }

  await db.createCollection('metrics', {
    timeseries: {
      timeField:    'ts',
      metaField:    'serverId',
      granularity:  'seconds',
    },
    expireAfterSeconds: 60 * 60 * 24,
  })

  console.log('[db] ✅ Created `metrics` time-series collection (24h TTL, second granularity).')
}
export const disconnectDB = async () => {
  await mongoose.connection.close()
  console.log('[db] MongoDB connection closed.')
}
