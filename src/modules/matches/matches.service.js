// src/modules/matches/matches.service.js
import Match from "../../models/Match.js";

function toStr(v) {
  try {
    return v?.toString?.() || "";
  } catch {
    return "";
  }
}

export async function listMyMatchHistory(userId, { limit = 50 } = {}) {
  const uid = toStr(userId);
  if (!uid) throw new Error("Missing userId");

  const lim = Math.max(1, Math.min(200, Number(limit) || 50));

  const matches = await Match.find({
    status: "completed",
    "players.userId": uid,
  })
    .sort({ endedAt: -1, createdAt: -1 })
    .limit(lim)
    .populate("players.userId", "name username fullName nickname")
    .lean();

  return (matches || []).map((m) => {
    const players = Array.isArray(m.players) ? m.players : [];
    const opp = players
      .map((p) => p?.userId)
      .find((u) => toStr(u?._id) && toStr(u?._id) !== uid);

    const opponentName =
      opp?.nickname ||
      opp?.name ||
      opp?.fullName ||
      opp?.username ||
      "Opponent";

    const playedAt = m.endedAt || m.createdAt || new Date();

    return {
      matchId: m.matchId,
      playedAt,
      opponentName,
    };
  });
}
