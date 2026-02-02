// src/modules/achievements/achievements.controller.js
import User from "../../models/User.js";
import { ACHIEVEMENTS } from "../../services/achievements.service.js";

function normalizeUnlocked(user) {
  const list = Array.isArray(user.unlockedAchievements) ? user.unlockedAchievements : [];
  const map = new Map();
  for (const a of list) {
    if (!a?.key) continue;
    map.set(a.key, {
      key: a.key,
      unlockedAt: a.unlockedAt || null,
      source: a.source || "",
    });
  }
  return map;
}

export async function getAchievementsCatalog(_req, res) {
  // Don’t expose the condition function to clients; send clean metadata only
  const catalog = ACHIEVEMENTS.map((a) => ({
    key: a.key,
    title: a.title,
    type: a.type,
    rewardPoints: Number(a.rewardPoints || 0),
    rewardCoins: Number(a.rewardCoins || 0),
  }));

  return res.ok({ achievements: catalog });
}

export async function getMyAchievements(req, res) {
  const userId = req.userId;

  const user = await User.findById(userId).select(
    "unlockedAchievements achievementProgress economy gamingStats"
  );

  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  const unlockedMap = normalizeUnlocked(user);

  const achievements = ACHIEVEMENTS.map((a) => {
    const unlocked = unlockedMap.get(a.key) || null;

    // Basic “progress” support:
    // - we return a value if present in achievementProgress map
    // - otherwise null
    const progressRaw =
      user.achievementProgress?.get?.(a.key) ??
      user.achievementProgress?.[a.key] ??
      null;

    return {
      key: a.key,
      title: a.title,
      type: a.type,
      rewardPoints: Number(a.rewardPoints || 0),
      rewardCoins: Number(a.rewardCoins || 0),
      unlocked: !!unlocked,
      unlockedAt: unlocked?.unlockedAt ?? null,
      source: unlocked?.source ?? "",
      progress: typeof progressRaw === "number" ? progressRaw : null,
    };
  });

  return res.ok({
    economy: {
      pointsBalance: user.economy?.pointsBalance ?? 0,
      coinsBalance: user.economy?.coinsBalance ?? 0,
      lifetimePointsEarned: user.economy?.lifetimePointsEarned ?? 0,
      lifetimeCoinsEarned: user.economy?.lifetimeCoinsEarned ?? 0,
    },
    stats: {
      wins: user.gamingStats?.wins ?? 0,
      losses: user.gamingStats?.losses ?? 0,
      draws: user.gamingStats?.draws ?? 0,
      totalGames: user.gamingStats?.totalGames ?? 0,
      streak: user.gamingStats?.streak ?? 0,
      maxStreak: user.gamingStats?.maxStreak ?? 0,
    },
    achievements,
  });
}
