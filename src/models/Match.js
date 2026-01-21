// src/models/Match.js
import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    team: {
      type: String,
      enum: ["red", "blue", "green", "yellow"],
      default: "red",
    },

    connected: { type: Boolean, default: false },
    ready: { type: Boolean, default: false },

    stats: {
      moves: { type: Number, default: 0 },
      captures: { type: Number, default: 0 },
      timeSpent: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    gameMode: {
      type: String,
      enum: ["1v1", "2v2", "3v3", "free-for-all"],
      default: "1v1",
      index: true,
    },

    region: {
      type: String,
      enum: ["na", "eu", "asia", "global"],
      default: "global",
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled"],
      default: "pending",
      index: true,
    },

    players: {
      type: [playerSchema],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length >= 2;
        },
        message: "Match must have at least 2 players",
      },
    },

    settings: {
      maxPlayers: { type: Number, default: 2 },
      duration: { type: Number, default: 600 },
      isRanked: { type: Boolean, default: false },
      allowSpectators: { type: Boolean, default: false },
    },

    gameState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Helpful compound indexes
matchSchema.index({ status: 1, gameMode: 1, region: 1 });
matchSchema.index({ createdAt: -1 });

// Generate matchId if missing
matchSchema.pre("save", function (next) {
  if (!this.matchId) {
    // Simple stable ID format:
    // M-<timestamp>-<random>
    const rand = Math.random().toString(16).slice(2, 8);
    this.matchId = `M-${Date.now()}-${rand}`;
  }
  next();
});

export const Match = mongoose.model("Match", matchSchema);
export default Match;
