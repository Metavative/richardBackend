// src/models/AdEvent.js
import mongoose from "mongoose";

const adEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Where the ad was shown
    placement: {
      type: String,
      required: true,
      index: true, // queried constantly
    },

    // interstitial | rewarded | banner (future-proof)
    adType: {
      type: String,
      default: "interstitial",
      index: true,
    },

    // Canonical ad lifecycle events
    event: {
      type: String,
      enum: [
        "requested",
        "loaded",
        "shown",
        "dismissed",
        "clicked",
        "failed",
      ],
      required: true,
      index: true,
    },

    // e.g. "admob", "unity", "applovin"
    provider: {
      type: String,
      default: "unknown",
      index: true,
    },

    // small metadata only (error codes, latency, etc)
    meta: {
      type: Object,
      default: {},
    },

    // YYYY-MM-DD (UTC) — used for daily caps
    createdDay: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * Indexes optimized for:
 * 1) Daily caps
 * 2) Cooldown checks
 * 3) Analytics later
 */

// Daily cap count (shown per day)
adEventSchema.index({
  userId: 1,
  placement: 1,
  event: 1,
  createdDay: 1,
});

// Cooldown: last shown ad
adEventSchema.index({
  userId: 1,
  placement: 1,
  event: 1,
  createdAt: -1,
});

export default mongoose.model("AdEvent", adEventSchema);
