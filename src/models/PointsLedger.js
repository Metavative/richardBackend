// src/models/PointsLedger.js
import mongoose from "mongoose";

const pointsLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // MATCH_WIN, MATCH_LOSS, ACHIEVEMENT, ADMIN, etc.
    source: { type: String, required: true, index: true },

    // matchId or achievementKey or other unique reference
    refId: { type: String, required: true, index: true },

    pointsDelta: { type: Number, default: 0 },
    coinsDelta: { type: Number, default: 0 },

    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

// ✅ Critical: prevents double-awarding for same user+event
pointsLedgerSchema.index({ userId: 1, source: 1, refId: 1 }, { unique: true });

export const PointsLedger = mongoose.model("PointsLedger", pointsLedgerSchema);
export default PointsLedger;
