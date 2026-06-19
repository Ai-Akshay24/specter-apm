import mongoose from 'mongoose'

const { Schema } = mongoose

const TopologySchema = new Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }   // embedded subdocument — no need for its own _id
)

const ServerSchema = new Schema(
  {
    // ── tenant isolation ────────────────────────────────────────────────────
    orgId: {
      type:      Schema.Types.ObjectId,
      ref:       'Organization',
      required:  true,
      index:     true,
    },
    serverId: {
      type:      String,
      required:  true,
      trim:      true,
    },
    label: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 64,
    },
    region: {
      type:      String,
      required:  true,
      trim:      true,
      lowercase: true,
    },
    ip: {
      type:      String,
      required:  true,
      validate: {
        validator: (v) =>
          /^[a-zA-Z0-9.:_-]+$/.test(v),
        message: (props) => `${props.value} is not a valid IP/hostname`,
      },
    },
    status: {
      type:    String,
      enum:    ['operational', 'warning', 'critical', 'offline'],
      default: 'operational',
      index:   true,   // frequently filtered ("show me all critical nodes")
    },
    tags: {
      type:    [String],
      default: [],
    },
    topology: {
      type:     TopologySchema,
      required: true,
    },
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },
    deletedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true,   // adds createdAt / updatedAt automatically
  }
)
ServerSchema.index({ orgId: 1, isActive: 1 })

ServerSchema.index({ orgId: 1, serverId: 1 }, { unique: true })

ServerSchema.methods.softDelete = function softDelete() {
  this.isActive  = false
  this.deletedAt = new Date()
  return this.save()
}

ServerSchema.statics.findActiveForOrg = function findActiveForOrg(orgId) {
  return this.find({ orgId, isActive: true }).sort({ label: 1 }).lean()
}

export const Server = mongoose.model('Server', ServerSchema)
export default Server
