// src/models/Challenge.js
import mongoose from "mongoose";

const challengeSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate pending challenges between the same two users
challengeSchema.index(
  { fromUserId: 1, toUserId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

export const Challenge = mongoose.model("Challenge", challengeSchema);
export default Challenge;
