import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import validator from "validator";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, unique: true, sparse: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Invalid email"],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    emailVerified: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["unassigned", "sourcer", "investor", "admin"],
      default: "unassigned",
    },
    profile_picture: {
      key: { type: String },
      url: { type: String },
    },
    refreshToken: { type: String, select: false },
    
    // ============ GAMING FIELDS ============
    gamingStats: {
      mmr: { type: Number, default: 1000, min: 0 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
      totalGames: { type: Number, default: 0 },
      winRate: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      maxStreak: { type: Number, default: 0 }
    },
    gamePreferences: {
      region: { type: String, enum: ['na', 'eu', 'asia', 'global'], default: 'na' },
      gameMode: { type: String, enum: ['1v1', '2v2', '3v3', 'free-for-all'], default: '1v1' },
      autoAccept: { type: Boolean, default: true },
      maxWaitTime: { type: Number, default: 30000 }
    },
    isOnline: { type: Boolean, default: false },
    isInQueue: { type: Boolean, default: false },
    isInMatch: { type: Boolean, default: false },
    currentMatchId: { type: String, default: null },
    lastMatchAt: { type: Date },
    socketId: { type: String, default: null },
    // =======================================
    
  },
  { timestamps: true }
);

// Password hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Gaming stats calculation
userSchema.pre('save', function(next) {
  if (this.isModified('gamingStats.wins') || this.isModified('gamingStats.losses') || 
      this.isModified('gamingStats.draws')) {
    const { wins, losses, draws } = this.gamingStats;
    this.gamingStats.totalGames = wins + losses + draws;
    if (this.gamingStats.totalGames > 0) {
      this.gamingStats.winRate = (wins / this.gamingStats.totalGames) * 100;
    }
  }
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Gaming methods
userSchema.methods.updateMMR = function(change) {
  this.gamingStats.mmr += change;
  if (this.gamingStats.mmr < 0) this.gamingStats.mmr = 0;
  return this.save();
};

userSchema.methods.addWin = function() {
  this.gamingStats.wins += 1;
  this.gamingStats.streak = (this.gamingStats.streak > 0 ? this.gamingStats.streak + 1 : 1);
  if (this.gamingStats.streak > this.gamingStats.maxStreak) {
    this.gamingStats.maxStreak = this.gamingStats.streak;
  }
  return this.save();
};

userSchema.methods.addLoss = function() {
  this.gamingStats.losses += 1;
  this.gamingStats.streak = 0;
  return this.save();
};

userSchema.methods.addDraw = function() {
  this.gamingStats.draws += 1;
  this.gamingStats.streak = 0;
  return this.save();
};

export const User = mongoose.model("User", userSchema);
export default User;