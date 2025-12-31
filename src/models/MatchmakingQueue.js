import mongoose from "mongoose";

const matchmakingQueueSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true
  },
  mmr: {
    type: Number,
    required: true,
    min: 0,
    default: 1000
  },
  gameMode: {
    type: String,
    required: true,
    enum: ["1v1", "2v2", "3v3", "free-for-all"],
    default: "1v1"
  },
  region: {
    type: String,
    required: true,
    enum: ["na", "eu", "asia", "global"],
    default: "na"
  },
  joinedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  socketId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["waiting", "matched", "cancelled", "timeout", "found"],
    default: "waiting"
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30000),
    index: { expires: 0 }
  }
}, {
  timestamps: true
});

// Indexes for efficient matching
matchmakingQueueSchema.index({ gameMode: 1, region: 1, mmr: 1, joinedAt: 1 });
matchmakingQueueSchema.index({ status: 1 });

// Static methods
matchmakingQueueSchema.statics.findPotentialMatches = function(player, maxDifference = 200) {
  return this.find({
    _id: { $ne: player._id },
    gameMode: player.gameMode,
    region: player.region,
    status: "waiting",
    mmr: { 
      $gte: player.mmr - maxDifference,
      $lte: player.mmr + maxDifference
    }
  }).sort({ joinedAt: 1 }).limit(10);
};

matchmakingQueueSchema.statics.cleanup = async function() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return this.deleteMany({
    $or: [
      { status: "cancelled", createdAt: { $lt: thirtyMinutesAgo } },
      { status: "timeout", createdAt: { $lt: thirtyMinutesAgo } },
      { expiresAt: { $lt: new Date() }, status: "waiting" }
    ]
  });
};

// Instance methods
matchmakingQueueSchema.methods.markAsMatched = function() {
  this.status = "matched";
  return this.save();
};

matchmakingQueueSchema.methods.cancel = function() {
  this.status = "cancelled";
  return this.save();
};

const MatchmakingQueue = mongoose.model("MatchmakingQueue", matchmakingQueueSchema);
export default MatchmakingQueue; 