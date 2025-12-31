import mongoose from "mongoose";
const { Schema } = mongoose;

const FriendRequestSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

/**
 * Indexes for production performance (no breaking changes)
 * - Prevents slow scans as data grows
 * - Supports typical queries:
 *   - outgoing pending: { from, status }
 *   - incoming pending: { to, status }
 *   - recent feed: { status, createdAt }
 *   - duplicate checks: { from, to }
 */
FriendRequestSchema.index({ from: 1, to: 1 });
FriendRequestSchema.index({ to: 1, status: 1, createdAt: -1 });
FriendRequestSchema.index({ from: 1, status: 1, createdAt: -1 });
FriendRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.FriendRequest ||
  mongoose.model("FriendRequest", FriendRequestSchema);
