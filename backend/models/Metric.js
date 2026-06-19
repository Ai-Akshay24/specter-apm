import mongoose from 'mongoose'

const { Schema } = mongoose

const MetricSchema = new Schema(
  {
    ts: {
      type:     Date,
      required: true,
      default:  Date.now,
    },
    serverId: {
      type:     String,
      required: true,
    },
    orgId: {
      type:     Schema.Types.ObjectId,
      required: true,
    },
    cpu: {
      type:     Number,
      required: true,
      min:      0,
      max:      100,
    },
    mem: {
      type:     Number,
      required: true,
      min:      0,
    },
    net: {
      type:     Number,
      required: true,
      min:      0,
    },
    latency: {
      type:     Number,
      required: true,
      min:      0,
    },
    sessions: {
      type:     Number,
      required: true,
      min:      0,
    },
  },
  {
    timestamps: false,
    timeseries: {
      timeField:   'ts',
      metaField:   'serverId',
      granularity: 'seconds',
    },
  }
)
MetricSchema.index({ orgId: 1, serverId: 1, ts: -1 })
MetricSchema.statics.getRecentHistory = function getRecentHistory(orgId, serverId, limit = 60) {
  return this.find({ orgId, serverId })
    .sort({ ts: -1 })
    .limit(limit)
    .lean()
    .then((docs) => docs.reverse())   // re-order to oldest-first for charting
}
MetricSchema.statics.insertBatch = function insertBatch(orgId, batch) {
  const docs = batch.servers.map((s) => ({
    ts:       new Date(s.ts),
    serverId: s.serverId,
    orgId,
    cpu:      s.cpu,
    mem:      s.mem,
    net:      s.net,
    latency:  s.latency,
    sessions: s.sessions,
  }))
  return this.insertMany(docs, { ordered: false })
}

export const Metric = mongoose.model('Metric', MetricSchema)
export default Metric
