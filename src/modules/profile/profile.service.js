import mongoose from "mongoose";
import User from "../../models/User.js";
import Match from "../../models/Match.js";
import Achievement from "../../models/achievement.js";
import UserAchievement from "../../models/UserAchievement.js";

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export async function getMyStats(userId) {
  const u = await User.findById(userId).select("gamingStats").lean();
  const gs = u?.gamingStats || {};

  const gamesPlayed = toInt(gs.totalGames, 0);
  const wins = toInt(gs.wins, 0);
  const losses = toInt(gs.losses, 0);
  const draws = toInt(gs.draws, 0);

  // stored as percent (0..100)
  const winRate = toNum(gs.winRate, 0) / 100;

  return {
    gamesPlayed,
    wins,
    losses,
    draws,
    winRate,
    currentStreak: toInt(gs.streak, 0),
    bestStreak: toInt(gs.maxStreak, 0),
    mmr: toInt(gs.mmr, 1000),
  };
}

export async function getMyHistory(userId, { page = 1, limit = 20 }) {
  const uid = new mongoose.Types.ObjectId(userId);
  const p = Math.max(1, toInt(page, 1));
  const l = Math.min(50, Math.max(1, toInt(limit, 20)));
  const skip = (p - 1) * l;

  const query = {
    status: "completed",
    "players.userId": uid,
    endedAt: { $ne: null },
  };

  const [total, matches] = await Promise.all([
    Match.countDocuments(query),
    Match.find(query)
      .sort({ endedAt: -1 })
      .skip(skip)
      .limit(l)
      .select({ matchId: 1, players: 1, winner: 1, endedAt: 1 })
      .populate({ path: "players.userId", select: "name username profile_picture" })
      .lean(),
  ]);

  const items = matches.map((m) => {
    const opp = (m.players || []).find((pl) => String(pl.userId?._id) !== String(uid));
    const opponentName = opp?.userId?.username || opp?.userId?.name || "Opponent";
    const result = m.winner && String(m.winner) === String(uid) ? "WIN" : "LOSS";

    return {
      matchId: m.matchId || "",
      opponentName,
      result,
      playedAt: m.endedAt || m.updatedAt || m.createdAt,
    };
  });

  const pages = Math.max(1, Math.ceil(total / l));
  return { items, page: p, pages, total };
}

export async function getMyAchievements(userId) {
  const stats = await getMyStats(userId);
  const defs = await Achievement.find({ active: true }).sort({ sort: 1 }).lean();

  const valueFor = (metricKey) => {
    switch (metricKey) {
      case "wins":
        return stats.wins;
      case "losses":
        return stats.losses;
      case "draws":
        return stats.draws;
      case "totalGames":
        return stats.gamesPlayed;
      case "winRate":
        // compare as whole % for achievements like "Win rate 60%"
        return Math.round(stats.winRate * 100);
      case "streak":
        return stats.currentStreak;
      case "maxStreak":
        return stats.bestStreak;
      case "mmr":
        return stats.mmr;
      default:
        return 0;
    }
  };

  await Promise.all(
    defs.map(async (a) => {
      const current = toInt(valueFor(a.metricKey), 0);
      const target = toInt(a.target, 0);
      const completedNow = target > 0 ? current >= target : false;

      const existing = await UserAchievement.findOne({
        userId,
        achievementId: a.achievementId,
      }).lean();

      if (!existing) {
        await UserAchievement.create({
          userId,
          achievementId: a.achievementId,
          current,
          target,
          completed: completedNow,
          completedAt: completedNow ? new Date() : null,
        });
        return;
      }

      const update = { current, target };
      if (!existing.completed && completedNow) {
        update.completed = true;
        update.completedAt = new Date();
      }

      await UserAchievement.updateOne(
        { userId, achievementId: a.achievementId },
        { $set: update }
      );
    })
  );

  const rows = await UserAchievement.find({ userId }).lean();
  const byId = new Map(rows.map((r) => [r.achievementId, r]));

  return defs.map((a) => {
    const r = byId.get(a.achievementId);
    return {
      id: a.achievementId,
      title: a.title,
      description: a.description,
      iconUrl: a.iconUrl || "",
      metricKey: a.metricKey,
      current: r?.current ?? 0,
      target: r?.target ?? a.target ?? 0,
      completed: r?.completed ?? false,
      completedAt: r?.completedAt ?? null,
    };
  });
}
