// src/services/achievements.service.js
import User from "../models/User.js";
import PointsLedger from "../models/PointsLedger.js";

/**
 * Achievement definitions (simple + effective).
 * Extend anytime.
 */
export const ACHIEVEMENTS = [
  // Wins
  {
    key: "first_win",
    title: "First Win",
    type: "MILESTONE",
    rewardPoints: 50,
    rewardCoins: 0,
    condition: (u) => (u.gamingStats?.wins ?? 0) >= 1,
  },
  {
    key: "wins_10",
    title: "10 Wins",
    type: "MILESTONE",
    rewardPoints: 150,
    rewardCoins: 10,
    condition: (u) => (u.gamingStats?.wins ?? 0) >= 10,
  },
  {
    key: "wins_50",
    title: "50 Wins",
    type: "MILESTONE",
    rewardPoints: 500,
    rewardCoins: 50,
    condition: (u) => (u.gamingStats?.wins ?? 0) >= 50,
  },

  // Games played
  {
    key: "games_10",
    title: "10 Games Played",
    type: "MILESTONE",
    rewardPoints: 80,
    rewardCoins: 0,
    condition: (u) => (u.gamingStats?.totalGames ?? 0) >= 10,
  },
  {
    key: "games_100",
    title: "100 Games Played",
    type: "MILESTONE",
    rewardPoints: 600,
    rewardCoins: 50,
    condition: (u) => (u.gamingStats?.totalGames ?? 0) >= 100,
  },

  // Points earned
  {
    key: "points_500",
    title: "Earn 500 Points",
    type: "MILESTONE",
    rewardPoints: 100,
    rewardCoins: 0,
    condition: (u) => (u.economy?.lifetimePointsEarned ?? 0) >= 500,
  },
  {
    key: "points_2000",
    title: "Earn 2,000 Points",
    type: "MILESTONE",
    rewardPoints: 300,
    rewardCoins: 25,
    condition: (u) => (u.economy?.lifetimePointsEarned ?? 0) >= 2000,
  },
];

function hasUnlocked(user, key) {
  const arr = user.unlockedAchievements || [];
  return arr.some((a) => a?.key === key);
}

/**
 * ✅ Named export used by economy.service.js
 * Unlock eligible achievements and award rewards idempotently.
 */
export async function checkAndUnlockAchievements(userId, { reason = "" } = {}) {
  const user = await User.findById(userId);
  if (!user) return { unlocked: [], totalPointsAwarded: 0, totalCoinsAwarded: 0 };

  const unlockedNow = [];
  let totalPointsAwarded = 0;
  let totalCoinsAwarded = 0;

  for (const a of ACHIEVEMENTS) {
    if (hasUnlocked(user, a.key)) continue;
    if (!a.condition(user)) continue;

    // mark unlocked
    user.unlockedAchievements.push({
      key: a.key,
      unlockedAt: new Date(),
      source: reason,
    });

    unlockedNow.push(a.key);

    const refId = `achievement:${a.key}`;
    const pointsDelta = Number(a.rewardPoints || 0);
    const coinsDelta = Number(a.rewardCoins || 0);

    if (pointsDelta !== 0 || coinsDelta !== 0) {
      try {
        // ledger prevents double reward
        await PointsLedger.create({
          userId: user._id,
          source: "ACHIEVEMENT",
          refId,
          pointsDelta,
          coinsDelta,
          meta: { key: a.key, reason },
        });

        // apply balances
        user.economy.pointsBalance = Math.max(0, (user.economy.pointsBalance || 0) + pointsDelta);
        user.economy.coinsBalance = Math.max(0, (user.economy.coinsBalance || 0) + coinsDelta);

        user.economy.lifetimePointsEarned =
          (user.economy.lifetimePointsEarned || 0) + Math.max(0, pointsDelta);
        user.economy.lifetimeCoinsEarned =
          (user.economy.lifetimeCoinsEarned || 0) + Math.max(0, coinsDelta);

        totalPointsAwarded += pointsDelta;
        totalCoinsAwarded += coinsDelta;
      } catch (_) {
        // duplicate ledger => already awarded, ignore
      }
    }
  }

  if (unlockedNow.length > 0) {
    await user.save();
  }

  return { unlocked: unlockedNow, totalPointsAwarded, totalCoinsAwarded };
}

export default {
  ACHIEVEMENTS,
  checkAndUnlockAchievements,
};
