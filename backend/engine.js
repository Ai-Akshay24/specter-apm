import si from 'systeminformation'
// ── ADDED ──
import { Metric } from './models/Metric.js' 

// ── ADDED: Active Roster Tracking ──
const activeOrgIds = new Set()
export const addActiveOrg = (orgId) => activeOrgIds.add(orgId)
export const removeActiveOrg = (orgId) => activeOrgIds.delete(orgId)


// ─── persona definitions ──────────────────────────────────────────────────────
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
    latBase:      32,     latJitter: 18,   
    sessBase:     220,    sessScale: 190,
    spikeAffinity: 0.60,
  },
  'srv-004': {
    label:        'US-WEST-CACHE-01 (Cache)',
    cpuScale:     0.20,   cpuOffset: 3,   cpuSigma: 3,
    memScale:     0.60,   memBase:   42,  memCeil: 88,  
    netScale:     0.85,   netBase:   2.8,
    latBase:      2,      latJitter: 5,    
    sessBase:     800,    sessScale: 400,  
    spikeAffinity: 0.35,
  },
  'srv-005': {
    label:        'AP-SOUTH-APP-01 (Secondary)',
    cpuScale:     1.10,   cpuOffset: 22,  cpuSigma: 9,  
    memScale:     0.50,   memBase:   55,  memCeil: 105,
    netScale:     0.55,   netBase:   0.8,
    latBase:      55,     latJitter: 45,  
    sessBase:     90,     sessScale: 120,
    spikeAffinity: 0.70,
  },
  'srv-006': {
    label:        'US-EAST-LB-01 (Load Balancer)',
    cpuScale:     0.18,   cpuOffset: 4,   cpuSigma: 2,
    memScale:     0.12,   memBase:   6,   memCeil: 18,  
    netScale:     2.20,   netBase:   8.0,               
    latBase:      4,      latJitter: 8,
    sessBase:     1100,   sessScale: 700,                
    spikeAffinity: 1.00,                                 
  },
}

let TOTAL_MEM_GB = 16  
const gaussian = () => {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const SPIKE_PERIOD   = 15_000   
const SPIKE_CHANCE   = 0.30     
const SPIKE_DURATION = 5        
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
                 + Math.abs(gaussian()) * 0.8    
                 + spike * p.netBase * 1.8 * Math.random()
  const net = parseFloat(Math.max(0, rawNet).toFixed(2))
  
  const rawLat = p.latBase
                 + Math.abs(gaussian()) * (p.latJitter / 2)
                 + spike * p.latBase * 1.2 * Math.random()
  const latency = clamp(Math.round(rawLat), 1, 999)

  const rawSess = p.sessBase
                 + Math.abs(gaussian()) * (p.sessScale / 2)
                 + spike * p.sessBase * 0.6 * Math.random()
  const sessions = Math.max(0, Math.round(rawSess))

  return { serverId, ts, cpu, mem, net, latency, sessions }
}

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

      // ── ADDED: Database Persistence ──
      // Loop through all active organizations and save the batch to their specific DB records
      if (activeOrgIds.size > 0) {
        activeOrgIds.forEach(orgId => {
          Metric.insertBatch(orgId, batch).catch(err => 
            console.error(`[db] Write failed for org ${orgId}:`, err.message)
          )
        })
      }

      if (process.env.NODE_ENV !== 'production') {
        const spike = isSpiking ? ' ⚡SPIKE' : ''
        console.log(`[tick] cpu=${baseCpu.toFixed(1).padEnd(5)} mem=${(baseMemFraction * 100).toFixed(0).padEnd(3)}% net=${baseNetMBps.toFixed(2).padEnd(6)}MB/s clients=${clientCount}${spike}`)
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