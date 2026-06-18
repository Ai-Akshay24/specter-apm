/**
 * telemetry/engine.js  —  Specter APM
 *
 * Reads real CPU, Memory, and Network metrics from the host machine using
 * the `systeminformation` library, then mathematically fans them out into
 * six independent server personas that match the frontend's MOCK_SERVERS IDs.
 *
 * ─── Why one machine → six payloads? ─────────────────────────────────────────
 *
 * Running locally means we have one real baseline signal.  Instead of pure
 * Math.random() noise (which looks fake — no temporal correlation), each
 * persona applies:
 *   1. A deterministic ROLE_PROFILE multiplier that shifts the baseline into
 *      a realistic operating range for that server type.
 *   2. A per-persona Gaussian-approximated jitter (Box-Muller transform) so
 *      each node drifts independently rather than tracking identically.
 *   3. A shared "event clock" that injects coordinated spike events (e.g. a
 *      traffic surge hits the load balancer and the app servers, but not the
 *      cache) — making the topology feel like a real interconnected cluster.
 *
 * ─── Socket.io event contract ─────────────────────────────────────────────────
 *
 * Emitted event : 'telemetry:batch'
 * Payload shape :
 *   {
 *     ts:      number,          // Unix ms — Date.now()
 *     servers: ServerMetric[]   // one entry per node, length always 6
 *   }
 *
 * ServerMetric shape (must match frontend useTelemetry.js consumer):
 *   {
 *     serverId: string,   // 'srv-001' … 'srv-006'
 *     ts:       number,   // same as batch ts (convenience duplicate)
 *     cpu:      number,   // 0–100  percent
 *     mem:      number,   // GB used, one decimal place
 *     net:      number,   // MB/s  (inbound + outbound combined), two decimals
 *     latency:  number,   // ms  integer
 *     sessions: number,   // active session count  integer
 *   }
 */

import si from 'systeminformation'

// ─── persona definitions ──────────────────────────────────────────────────────
//
// Each profile maps a real baseline reading [0..1] to a synthetic server range.
// The transform is:  synthetic = base × scale + offset + jitter(sigma)
//
// Fields:
//   cpuScale    multiplier applied to real cpu%
//   cpuOffset   always-on baseline load (simulates idle daemon processes)
//   memScale    multiplier applied to real mem% → converted to GB
//   memBase     minimum GB always consumed (e.g. DB buffer pool)
//   memCeil     realistic max GB for this role
//   netScale    multiplier on real net throughput reading
//   netBase     minimum MB/s (idle heartbeat traffic)
//   latBase     base latency ms
//   latJitter   max random latency addition per tick
//   sessBase    minimum active sessions
//   sessScale   multiplier on sessions variance
//   spikeAffinity  0-1: how strongly a global traffic spike hits this node
//   cpuSigma    Gaussian sigma for CPU jitter (realistic drift width)
//   label       human-readable role (for server logs)

const PERSONAS = {
  'srv-001': {
    label:        'US-EAST-DB-01 (Primary DB)',
    cpuScale:     0.55,   cpuOffset: 12,  cpuSigma: 4,
    memScale:     0.45,   memBase:   68,  memCeil: 118,
    netScale:     0.30,   netBase:   0.4,
    latBase:      8,      latJitter: 12,
    sessBase:     120,    sessScale: 80,
    spikeAffinity: 0.45,
  },
  'srv-002': {
    label:        'US-EAST-APP-01 (App/API)',
    cpuScale:     0.90,   cpuOffset: 8,   cpuSigma: 6,
    memScale:     0.35,   memBase:   28,  memCeil: 72,
    netScale:     0.70,   netBase:   1.2,
    latBase:      18,     latJitter: 25,
    sessBase:     340,    sessScale: 280,
    spikeAffinity: 0.80,
  },
  'srv-003': {
    label:        'EU-WEST-APP-01 (App/CDN)',
    cpuScale:     0.65,   cpuOffset: 6,   cpuSigma: 5,
    memScale:     0.30,   memBase:   22,  memCeil: 60,
    netScale:     1.40,   netBase:   3.5,
    latBase:      32,     latJitter: 18,   // cross-region latency floor
    sessBase:     220,    sessScale: 190,
    spikeAffinity: 0.60,
  },
  'srv-004': {
    label:        'US-WEST-CACHE-01 (Cache)',
    cpuScale:     0.20,   cpuOffset: 3,   cpuSigma: 3,
    memScale:     0.60,   memBase:   42,  memCeil: 88,  // cache fills RAM
    netScale:     0.85,   netBase:   2.8,
    latBase:      2,      latJitter: 5,    // sub-5ms target
    sessBase:     800,    sessScale: 400,  // high connection count (pooling)
    spikeAffinity: 0.35,
  },
  'srv-005': {
    label:        'AP-SOUTH-APP-01 (Secondary)',
    cpuScale:     1.10,   cpuOffset: 22,  cpuSigma: 9,  // runs hotter
    memScale:     0.50,   memBase:   55,  memCeil: 105,
    netScale:     0.55,   netBase:   0.8,
    latBase:      55,     latJitter: 45,  // high cross-region latency
    sessBase:     90,     sessScale: 120,
    spikeAffinity: 0.70,
  },
  'srv-006': {
    label:        'US-EAST-LB-01 (Load Balancer)',
    cpuScale:     0.18,   cpuOffset: 4,   cpuSigma: 2,
    memScale:     0.12,   memBase:   6,   memCeil: 18,  // LBs are memory-lean
    netScale:     2.20,   netBase:   8.0,               // high aggregate traffic
    latBase:      4,      latJitter: 8,
    sessBase:     1100,   sessScale: 700,                // all sessions route here
    spikeAffinity: 1.00,                                 // all traffic spikes hit LB
  },
}
let TOTAL_MEM_GB = 16  // safe default; overwritten after first si.mem() call
const gaussian = () => {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const SPIKE_PERIOD   = 15_000   // ms between spike windows
const SPIKE_CHANCE   = 0.30     // 30% chance per window
const SPIKE_DURATION = 5        // ticks the spike lasts
let   spikeTicksLeft = 0
let   lastSpikeCheck = Date.now()

const updateSpikeClock = () => {
  const now = Date.now()
  if (now - lastSpikeCheck >= SPIKE_PERIOD) {
    lastSpikeCheck = now
    if (Math.random() < SPIKE_CHANCE) {
      spikeTicksLeft = SPIKE_DURATION
      console.log('[Specter engine] ⚡ Traffic spike injected — %d ticks', SPIKE_DURATION)
    }
  }
  if (spikeTicksLeft > 0) spikeTicksLeft--
  return spikeTicksLeft > 0
}

const derivePayload = (serverId, baseCpu, baseMemFraction, baseNetMBps, isSpiking) => {
  const p    = PERSONAS[serverId]
  const ts   = Date.now()
  const spike = isSpiking ? p.spikeAffinity : 0

  const rawCpu = baseCpu * p.cpuScale
               + p.cpuOffset
               + gaussian() * p.cpuSigma
               + spike * 28 * Math.random()
  const cpu = clamp(Math.round(rawCpu), 0, 100)

  const rawMem = baseMemFraction * p.memScale * TOTAL_MEM_GB
               + p.memBase
               + gaussian() * 2.5
               + spike * 4 * Math.random()
  const mem = parseFloat(clamp(rawMem, p.memBase, p.memCeil).toFixed(1))

  const rawNet = baseNetMBps * p.netScale
               + p.netBase
               + Math.abs(gaussian()) * 0.8    // net jitter is always positive
               + spike * p.netBase * 1.8 * Math.random()
  const net = parseFloat(Math.max(0, rawNet).toFixed(2))
  const rawLat = p.latBase
               + Math.abs(gaussian()) * (p.latJitter / 2)
               + spike * p.latBase * 1.2 * Math.random()
  const latency = clamp(Math.round(rawLat), 1, 999)

  // Sessions — base + scaled variance + spike surge
  const rawSess = p.sessBase
                + Math.abs(gaussian()) * (p.sessScale / 2)
                + spike * p.sessBase * 0.6 * Math.random()
  const sessions = Math.max(0, Math.round(rawSess))

  return { serverId, ts, cpu, mem, net, latency, sessions }
}
/**
 * startEngine(io)
 *
 * Starts the 1000ms telemetry loop.  On every tick:
 *   1. Reads real CPU, RAM, and Network from the host via systeminformation.
 *   2. Maps those readings into 6 independent server payloads.
 *   3. Emits a 'telemetry:batch' event to all connected Socket.io clients.
 *
 * @param {import('socket.io').Server} io  — the Socket.io server instance
 * @returns {() => void}  — a cleanup function that stops the loop
 */
export const startEngine = async (io) => {
  try {
    const memInfo  = await si.mem()
    TOTAL_MEM_GB   = parseFloat((memInfo.total / 1073741824).toFixed(1))
    console.log('[Specter engine] Host RAM detected: %s GB', TOTAL_MEM_GB)
  } catch {
    console.warn('[Specter engine] Could not read host RAM — using default 16 GB')
  }

  try { await si.currentLoad() } catch { /* ignored */ }

  console.log('[Specter engine] Telemetry pump starting — 1000ms tick interval')

  const intervalId = setInterval(async () => {
    try {
      const [cpuLoad, memInfo, netStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.networkStats(),
      ])
      let baseCpu = clamp(cpuLoad.currentLoad ?? 0, 0, 100)
      if (isNaN(baseCpu)) baseCpu = 0

      const baseMemFraction = memInfo.total > 0
        ? clamp(memInfo.active / memInfo.total, 0, 1)
        : 0.5
      const totalRxBytes = netStats.reduce((a, n) => a + (n.rx_sec ?? 0), 0)
      const totalTxBytes = netStats.reduce((a, n) => a + (n.tx_sec ?? 0), 0)
      const baseNetMBps  = Math.max(0, (totalRxBytes + totalTxBytes) / 1_048_576)

      const isSpiking = updateSpikeClock()

      const servers = Object.keys(PERSONAS).map((id) =>
        derivePayload(id, baseCpu, baseMemFraction, baseNetMBps, isSpiking)
      )

      const batch = { ts: Date.now(), servers }

      const clientCount = io.engine.clientsCount
      if (clientCount > 0) {
        io.emit('telemetry:batch', batch)
      }

      if (process.env.NODE_ENV !== 'production') {
      const spike = isSpiking ? ' ⚡SPIKE' : ''
      console.log(`[tick] cpu=${baseCpu.toFixed(1).padEnd(5)} mem=${(baseMemFraction * 100).toFixed(0).padEnd(3)}% net=${baseNetMBps.toFixed(2).padEnd(6)}MB/s clients=${clientCount}${spike}`
     )
    }

    } catch (err) {
      console.error('[Specter engine] Tick error:', err.message)
    }
  }, 1000)

  return () => {
    clearInterval(intervalId)
    console.log('[Specter engine] Telemetry pump stopped.')
  }
}
