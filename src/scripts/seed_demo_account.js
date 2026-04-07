import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Cosmetic from "../models/Cosmetic.js";
import Achievement from "../models/achievement.js";
import UserAchievement from "../models/UserAchievement.js";
import { ACHIEVEMENTS } from "../services/achievements.service.js";

const DEMO_EMAIL = String(process.env.DEMO_EMAIL || "demo@latrel.app")
  .trim()
  .toLowerCase();
const DEMO_PASSWORD = String(process.env.DEMO_PASSWORD || "Demo@12345").trim();
const DEMO_NAME = String(process.env.DEMO_NAME || "Demo Account").trim();
const DEMO_NICKNAME = String(process.env.DEMO_NICKNAME || "DEMO").trim();
const DEMO_PROFILE_PIC = String(
  process.env.DEMO_PROFILE_PIC ||
    "https://api.dicebear.com/9.x/bottts/png?seed=latrel-demo"
).trim();

function normalizeUsername(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function findAvailableUsername(preferred, excludeUserId = null) {
  let base = normalizeUsername(preferred);
  if (base.length < 3) base = "demo_player";
  if (base.length > 20) base = base.slice(0, 20);

  let i = 0;
  while (true) {
    const suffix = i === 0 ? "" : `_${i}`;
    const maxBaseLen = Math.max(3, 20 - suffix.length);
    const candidate = `${base.slice(0, maxBaseLen)}${suffix}`;

    const taken = await User.findOne({
      username: candidate,
      ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
    })
      .select("_id")
      .lean();

    if (!taken) return candidate;
    i += 1;
  }
}

async function collectUnlockIds() {
  const ids = new Set();

  for (const a of ACHIEVEMENTS) {
    if (a?.key) ids.add(String(a.key).trim());
  }

  const dbAchievements = await Achievement.find({})
    .select("achievementId")
    .lean();
  for (const a of dbAchievements) {
    const id = String(a?.achievementId || "").trim();
    if (id) ids.add(id);
  }

  const cosmetics = await Cosmetic.find({ active: true })
    .select("unlockByAchievementId")
    .lean();
  for (const c of cosmetics) {
    const id = String(c?.unlockByAchievementId || "").trim();
    if (id) ids.add(id);
  }

  return Array.from(ids);
}

async function main() {
  try {
    await connectDB();

    let user = await User.findOne({ email: DEMO_EMAIL }).select("+password");
    const username = await findAvailableUsername(
      "demo_master",
      user?._id?.toString() || null
    );

    if (!user) {
      user = new User({
        name: DEMO_NAME,
        nickname: DEMO_NICKNAME,
        username,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        emailVerified: true,
        profile_picture: {
          key: "demo-seed",
          url: DEMO_PROFILE_PIC,
        },
      });
    } else {
      user.name = DEMO_NAME;
      user.nickname = DEMO_NICKNAME;
      user.username = username;
      user.password = DEMO_PASSWORD;
      user.emailVerified = true;
      user.profile_picture = {
        key: user.profile_picture?.key || "demo-seed",
        url: DEMO_PROFILE_PIC,
      };
    }

    user.entitlements = {
      adFree: true,
      premiumAI: true,
    };

    user.economy = {
      ...(user.economy || {}),
      pointsBalance: 50000,
      coinsBalance: 100000,
      lifetimePointsEarned: Math.max(
        Number(user.economy?.lifetimePointsEarned || 0),
        50000
      ),
      lifetimeCoinsEarned: Math.max(
        Number(user.economy?.lifetimeCoinsEarned || 0),
        100000
      ),
    };

    user.gamingStats = {
      ...(user.gamingStats || {}),
      mmr: Math.max(Number(user.gamingStats?.mmr || 0), 2500),
      wins: Math.max(Number(user.gamingStats?.wins || 0), 120),
      losses: Math.max(Number(user.gamingStats?.losses || 0), 20),
      draws: Math.max(Number(user.gamingStats?.draws || 0), 5),
      totalGames: Math.max(Number(user.gamingStats?.totalGames || 0), 145),
      streak: Math.max(Number(user.gamingStats?.streak || 0), 8),
      maxStreak: Math.max(Number(user.gamingStats?.maxStreak || 0), 20),
      winRate: Math.max(Number(user.gamingStats?.winRate || 0), 80),
    };

    user.unlockedAchievements = ACHIEVEMENTS.map((a) => ({
      key: a.key,
      unlockedAt: new Date(),
      source: "DEMO_SEED",
    }));

    const progressMap = new Map();
    for (const a of ACHIEVEMENTS) {
      progressMap.set(a.key, 1);
    }
    user.achievementProgress = progressMap;

    const activeCosmetics = await Cosmetic.find({ active: true })
      .sort({ sort: 1 })
      .select("cosmeticId type")
      .lean();
    const firstBoard = activeCosmetics.find((c) => c.type === "board");
    const firstPieces = activeCosmetics.find((c) => c.type === "pieces");
    user.cosmetics = {
      ...(user.cosmetics || {}),
      appliedBoardId: firstBoard?.cosmeticId || user.cosmetics?.appliedBoardId || "",
      appliedPiecesId:
        firstPieces?.cosmeticId || user.cosmetics?.appliedPiecesId || "",
    };

    await user.save();

    const unlockIds = await collectUnlockIds();
    if (unlockIds.length > 0) {
      const now = new Date();
      const ops = unlockIds.map((achievementId) => ({
        updateOne: {
          filter: { userId: user._id, achievementId },
          update: {
            $set: {
              current: 1,
              target: 1,
              completed: true,
              completedAt: now,
              updatedAt: now,
            },
            $setOnInsert: {
              userId: user._id,
              achievementId,
              createdAt: now,
            },
          },
          upsert: true,
        },
      }));
      await UserAchievement.bulkWrite(ops, { ordered: false });
    }

    console.log("Demo account ready");
    console.log(`email=${DEMO_EMAIL}`);
    console.log(`password=${DEMO_PASSWORD}`);
    console.log(`userId=${user._id.toString()}`);
    console.log(`unlockRecords=${unlockIds.length}`);
  } catch (err) {
    console.error("Failed to seed demo account:", err);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

main();
