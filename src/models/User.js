// src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import validator from "validator";

const unlockedAchievementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now },
    // Optional: record why it unlocked (match/points milestone/etc)
    source: { type: String, default: "" },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // NOTE: unique + sparse can allow multiple nulls, which is OK if username is optional
    username: { type: String, unique: true, sparse: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Invalid email"],
    },

    // password is select:false so it won't be returned by default
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

    // ✅ NEW: Monetization entitlements (ads + premium AI)
    entitlements: {
      adFree: { type: Boolean, default: false },
      premiumAI: { type: Boolean, default: false },
    },

    cosmetics: {
      appliedBoardId: { type: String, default: "" },
      appliedPiecesId: { type: String, default: "" },
    },

    // ============================
    // ECONOMY / PROGRESSION
    // ============================
    // Points (XP): earned from matches + achievements, also unlocks achievements
    // Coins: spendable currency to buy skins
    economy: {
      pointsBalance: { type: Number, default: 0, min: 0 },
      coinsBalance: { type: Number, default: 0, min: 0 },

      // lifetime totals are helpful for analytics + achievement conditions
      lifetimePointsEarned: { type: Number, default: 0, min: 0 },
      lifetimeCoinsEarned: { type: Number, default: 0, min: 0 },

      // optional: track last time we awarded points to avoid weird duplicates
      lastPointsAwardAt: { type: Date },

      // track how many lifetime points have already been used to claim coins
      lastCoinClaimPoints: { type: Number, default: 0, min: 0 },
    },

    // Achievement tracking:
    unlockedAchievements: { type: [unlockedAchievementSchema], default: [] },

    achievementProgress: {
      type: Map,
      of: Number,
      default: {},
    },

    // ============ GAMING FIELDS ============
    gamingStats: {
      mmr: { type: Number, default: 1000, min: 0 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
      totalGames: { type: Number, default: 0 },
      winRate: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      maxStreak: { type: Number, default: 0 },
    },

    gamePreferences: {
      region: {
        type: String,
        enum: ["na", "eu", "asia", "global"],
        default: "na",
      },
      gameMode: {
        type: String,
        enum: ["1v1", "2v2", "3v3", "free-for-all"],
        default: "1v1",
      },
      autoAccept: { type: Boolean, default: true },
      maxWaitTime: { type: Number, default: 30000 },
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

userSchema.index({ name: 1 });
userSchema.index({ "gamingStats.mmr": -1 });

userSchema.set("toJSON", {
  transform: function (_doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.__v;
    return ret;
  },
});

userSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.pre("save", function (next) {
  try {
    if (
      this.isModified("gamingStats.wins") ||
      this.isModified("gamingStats.losses") ||
      this.isModified("gamingStats.draws")
    ) {
      const { wins, losses, draws } = this.gamingStats;
      this.gamingStats.totalGames = wins + losses + draws;

      if (this.gamingStats.totalGames > 0) {
        this.gamingStats.winRate = (wins / this.gamingStats.totalGames) * 100;
      } else {
        this.gamingStats.winRate = 0;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.updateMMR = function (change) {
  this.gamingStats.mmr += change;
  if (this.gamingStats.mmr < 0) this.gamingStats.mmr = 0;
  return this.save();
};

userSchema.methods.addWin = function () {
  this.gamingStats.wins += 1;
  this.gamingStats.streak =
    this.gamingStats.streak > 0 ? this.gamingStats.streak + 1 : 1;

  if (this.gamingStats.streak > this.gamingStats.maxStreak) {
    this.gamingStats.maxStreak = this.gamingStats.streak;
  }
  return this.save();
};

userSchema.methods.addLoss = function () {
  this.gamingStats.losses += 1;
  this.gamingStats.streak = 0;
  return this.save();
};

userSchema.methods.addDraw = function () {
  this.gamingStats.draws += 1;
  this.gamingStats.streak = 0;
  return this.save();
};

userSchema.methods.getPublicProfile = function () {
  return {
    id: this._id?.toString(),
    name: this.name,
    username: this.username,
    profile_picture: this.profile_picture?.url
      ? { url: this.profile_picture.url }
      : null,
    gamingStats: {
      mmr: this.gamingStats?.mmr ?? 1000,
      wins: this.gamingStats?.wins ?? 0,
    },
    economy: {
      pointsBalance: this.economy?.pointsBalance ?? 0,
      coinsBalance: this.economy?.coinsBalance ?? 0,
    },
    entitlements: {
      adFree: this.entitlements?.adFree === true,
      premiumAI: this.entitlements?.premiumAI === true,
    },
    isOnline: this.isOnline ?? false,
  };
};

export const User = mongoose.model("User", userSchema);
export default User;
