/**
 * models/Organization.js  —  Specter APM
 *
 * The tenant root. Every Server, Metric, and User document traces back to
 * exactly one Organization via orgId.  This is the document you'd extend
 * first when adding billing (Stripe customerId), seat limits, or feature
 * flags per subscription tier.
 */

import mongoose from 'mongoose'

const { Schema } = mongoose

const OrganizationSchema = new Schema(
  {
    name: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 100,
    },

    // URL-safe identifier, e.g. for `specter.app/o/<slug>/dashboard`
    slug: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      lowercase: true,
      match:     /^[a-z0-9-]+$/,
    },

    // ── subscription / billing scaffold ─────────────────────────────────────
    plan: {
      type:    String,
      enum:    ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    maxServers: {
      type:    Number,
      default: 6,   // free tier limit — matches the current 6-node demo
    },
    stripeCustomerId: {
      type:    String,
      default: null,
    },

    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

export const Organization = mongoose.model('Organization', OrganizationSchema)
export default Organization
