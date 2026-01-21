// src/models/FriendRequest.js
import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicates for the same direction while pending/accepted
friendRequestSchema.index(
  { from: 1, to: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "accepted"] } } }
);

export const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);
export default FriendRequest;
