import mongoose from 'mongoose'
import bcrypt   from 'bcryptjs'

const { Schema } = mongoose

const SALT_ROUNDS = 12

const UserSchema = new Schema(
  {
    email: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      lowercase: true,
      validate: {
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message:   (props) => `${props.value} is not a valid email address`,
      },
    },
    passwordHash: {
      type:     String,
      required: true,
      select:   false,   // excluded from query results unless explicitly requested
    },
    name: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 80,
    },
    orgId: {
      type:     Schema.Types.ObjectId,
      ref:      'Organization',
      required: true,
      index:    true,
    },
    role: {
      type:    String,
      enum:    ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
    },

    isActive: {
      type:    Boolean,
      default: true,
    },
    lastLoginAt: {
      type:    Date,
      default: null,
    },
    refreshTokenHash: {
      type:   String,
      select: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)
UserSchema.index({ orgId: 1, role: 1 })

UserSchema.pre('save', async function hashPasswordIfModified(next) {
  if (!this.isModified('passwordHash')) return next()
  try {
    this.passwordHash = await bcrypt.hash(this.passwordHash, SALT_ROUNDS)
    next()
  } catch (err) {
    next(err)
  }
})

UserSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash)
}
UserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id:       this._id,
    email:    this.email,
    name:     this.name,
    orgId:    this.orgId,
    role:     this.role,
    isActive: this.isActive,
  }
}


UserSchema.statics.register = function register({ email, password, name, orgId, role }) {
  return this.create({
    email,
    passwordHash: password,   // hashed by the pre-save hook
    name,
    orgId,
    role,
  })
}


UserSchema.statics.findByEmailWithPassword = function findByEmailWithPassword(email) {
  return this.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash')
}

export const User = mongoose.model('User', UserSchema)
export default User
