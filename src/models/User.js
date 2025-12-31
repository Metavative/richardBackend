import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import validator from "validator";

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

/**
 * -----------------------------
 * Indexes (production performance)
 * -----------------------------
 * - email/username already have unique indexes via schema, but we add supporting indexes for search/sort.
 */
userSchema.index({ username: 1 });
userSchema.index({ name: 1 });
userSchema.index({ email: 1 });
userSchema.index({ "gamingStats.mmr": -1 });

/**
 * -----------------------------
 * Security: protect sensitive fields if anything is serialized
 * -----------------------------
 * NOTE: password and refreshToken are already select:false, but this protects against accidental manual selects.
 */
userSchema.set("toJSON", {
  transform: function (_doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    // keep internal Mongo fields if you want; often you keep _id and remove __v
    delete ret.__v;
    return ret;
  },
});

/**
 * -----------------------------
 * Hooks
 * -----------------------------
 */

// Password hashing
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

// Gaming stats calculation
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
        this.gamingStats.winRate =
          (wins / this.gamingStats.totalGames) * 100;
      } else {
        this.gamingStats.winRate = 0;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * -----------------------------
 * Auth methods
 * -----------------------------
 */

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * -----------------------------
 * Gaming methods
 * -----------------------------
 */

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

/**
 * -----------------------------
 * Public profile helper (for friends/search/leaderboards)
 * -----------------------------
 * Use this in routes so you never accidentally return sensitive fields.
 */
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
    isOnline: this.isOnline ?? false,
  };
};

export const User = mongoose.model("User", userSchema);
export default User;
