// src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import validator from "validator";

const unlockedAchievementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now },
    source: { type: String, default: "" },
  },
  { _id: false }
);

// Username rules: 3-20 chars, letters/numbers/underscore only
function normalizeUsername(v) {
  return String(v ?? "").trim().toLowerCase();
}
function isValidUsername(v) {
  const s = normalizeUsername(v);
  return /^[a-z0-9_]{3,20}$/.test(s);
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // ✅ chosen display name shown in app
    nickname: { type: String, trim: true, default: "" },

    // ✅ REQUIRED username (unique, normalized)
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 20,
      validate: {
        validator: function (v) {
          return isValidUsername(v);
        },
        message:
          "Username must be 3-20 characters and contain only letters, numbers, or underscores",
      },
    },

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

    // ✅ REQUIRED profile picture (url required)
    profile_picture: {
      key: { type: String, default: "" },
      url: {
        type: String,
        required: [true, "Profile picture is required"],
        trim: true,
      },
    },

    refreshToken: { type: String, select: false },

    entitlements: {
      adFree: { type: Boolean, default: false },
      premiumAI: { type: Boolean, default: false },
    },

    cosmetics: {
      appliedBoardId: { type: String, default: "" },
      appliedPiecesId: { type: String, default: "" },
    },

    economy: {
      pointsBalance: { type: Number, default: 0, min: 0 },
      coinsBalance: { type: Number, default: 0, min: 0 },

      lifetimePointsEarned: { type: Number, default: 0, min: 0 },
      lifetimeCoinsEarned: { type: Number, default: 0, min: 0 },

      lastPointsAwardAt: { type: Date },
      lastCoinClaimPoints: { type: Number, default: 0, min: 0 },
    },

    unlockedAchievements: { type: [unlockedAchievementSchema], default: [] },

    achievementProgress: {
      type: Map,
      of: Number,
      default: {},
    },

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
  },
  { timestamps: true }
);

userSchema.index({ name: 1 });
userSchema.index({ nickname: 1 });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ "gamingStats.mmr": -1 });

userSchema.set("toJSON", {
  transform: function (_doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.__v;
    return ret;
  },
});

// ✅ normalize username before validation/save
userSchema.pre("validate", function (next) {
  try {
    if (this.isModified("username")) {
      this.username = normalizeUsername(this.username);
    }
    next();
  } catch (err) {
    next(err);
  }
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
  const displayName =
    (this.nickname && String(this.nickname).trim()) ||
    (this.username && String(this.username).trim()) ||
    (this.name && String(this.name).trim()) ||
    "Player";

  const profilePic = this.profile_picture?.url || null;

  return {
    id: this._id?.toString(),
    displayName,
    nickname: this.nickname || "",
    name: this.name,
    username: this.username,
    profilePic,
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

const User = mongoose.model("User", userSchema);
export default User;