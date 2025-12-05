import mongoose from "mongoose";

const matchSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true,
    default: () => `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  players: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    username: String,
    mmr: { type: Number, default: 1000 },
    team: { type: String, enum: ["red", "blue"], default: "red" },
    score: { type: Number, default: 0 },
    ready: { type: Boolean, default: false },
    connected: { type: Boolean, default: true }
  }],
  gameMode: {
    type: String,
    required: true,
    enum: ["1v1", "2v2", "3v3", "free-for-all"],
    default: "1v1"
  },
  region: {
    type: String,
    required: true,
    enum: ["na", "eu", "asia", "global"]
  },
  status: {
    type: String,
    enum: ["pending", "starting", "in_progress", "completed", "cancelled", "abandoned"],
    default: "pending"
  },
  settings: {
    maxPlayers: { type: Number, default: 2 },
    duration: { type: Number, default: 600 },
    isRanked: { type: Boolean, default: true },
    allowSpectators: { type: Boolean, default: false }
  },
  results: {
    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    winningTeam: String,
    scores: { type: Map, of: Number },
    duration: Number,
    endedAt: Date
  },
  startedAt: { type: Date },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

// Indexes
matchSchema.index({ status: 1 });
matchSchema.index({ "players.userId": 1 });
matchSchema.index({ createdAt: -1 });

// Methods
matchSchema.methods.addPlayer = async function(playerData) {
  if (this.players.length >= this.settings.maxPlayers) {
    throw new Error("Match is full");
  }
  
  const existingPlayer = this.players.find(p => p.userId.toString() === playerData.userId.toString());
  if (existingPlayer) {
    existingPlayer.connected = true;
    await this.save();
    return this;
  }
  
  this.players.push({
    ...playerData,
    connected: true,
    ready: false
  });
  
  await this.save();
  return this;
};

matchSchema.methods.start = async function() {
  if (this.status !== "pending" && this.status !== "starting") {
    throw new Error("Match cannot be started");
  }
  
  this.status = "in_progress";
  this.startedAt = new Date();
  await this.save();
  
  return this;
};

matchSchema.methods.complete = async function(results) {
  if (this.status !== "in_progress") {
    throw new Error("Match is not in progress");
  }
  
  this.status = "completed";
  this.results = results;
  this.completedAt = new Date();
  this.results.duration = Math.floor((this.completedAt - this.startedAt) / 1000);
  await this.save();
  
  return this;
};

matchSchema.methods.isReadyToStart = function() {
  if (this.gameMode === "1v1") {
    return this.players.length >= 2;
  } else if (this.gameMode === "2v2") {
    return this.players.length >= 4;
  } else if (this.gameMode === "3v3") {
    return this.players.length >= 6;
  }
  return this.players.length >= 2;
};

matchSchema.methods.getOpponent = function(userId) {
  if (this.gameMode !== "1v1") return null;
  return this.players.find(p => p.userId.toString() !== userId.toString());
};

const Match = mongoose.model("Match", matchSchema);
export default Match;