// src/modules/stats/stats.service.js
import Match from "../../models/Match.js";
import User from "../../models/User.js";

function toId(v) {
  if (!v) return "";
  return v.toString();
}

function isFinishedStatus(s) {
  const v = (s || "").toString().toLowerCase();
  return v === "finished" || v === "completed" || v === "done" || v === "ended";
}

function pickPlayedAt(match) {
  return (
    match?.playedAt ||
    match?.endedAt ||
    match?.finishedAt ||
    match?.updatedAt ||
    match?.createdAt ||
    null
  );
}

function extractScoreForUser(match, userId) {
  const uid = toId(userId);

  const candidates = [match?.scores, match?.result?.scores, match?.match?.scores];

  for (const c of candidates) {
    if (Array.isArray(c)) {
      const row = c.find(
        (x) => toId(x?.userId) === uid || toId(x?.playerId) === uid
      );
      if (row && (row.score !== undefined || row.points !== undefined)) {
        const val = row.score ?? row.points;
        const n = Number(val);
        return Number.isFinite(n) ? n : null;
      }
    }
  }

  const map = match?.scoreByUserId || match?.scoresByUserId;
  if (map && typeof map === "object") {
    const val = map[uid];
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function extractWinnerId(match) {
  const w =
    match?.winnerId ??
    match?.winner ??
    match?.result?.winnerId ??
    match?.result?.winner ??
    match?.match?.winnerId ??
    match?.match?.winner;

  if (!w) return null;
  const s = toId(w);
  if (!s || s.toLowerCase() === "draw") return null;
  return s;
}

function extractPlayers(match) {
  const p = match?.players ?? match?.match?.players ?? [];
  if (!Array.isArray(p)) return [];
  return p
    .map((x) => {
      if (typeof x === "string" || typeof x === "number") return toId(x);
      if (x && typeof x === "object") {
        return (
          toId(x.userId) ||
          toId(x.playerId) ||
          toId(x.uid) ||
          toId(x.id) ||
          toId(x._id) ||
          toId(x.user?._id) ||
          toId(x.user?.id)
        );
      }
      return "";
    })
    .filter(Boolean);
}

function computeLongestWinStreak(matchesDesc, userId) {
  const uid = toId(userId);
  let longest = 0;
  let current = 0;

  for (const m of matchesDesc) {
    const winnerId = extractWinnerId(m);
    const isWin = winnerId && winnerId === uid;

    if (isWin) {
      current += 1;
      if (current > longest) longest = current;
      continue;
    }

    current = 0;
  }

  return longest;
}

export async function getMyStats(userId) {
  const uid = toId(userId);
  if (!uid) throw new Error("User ID missing");

  const user = await User.findById(uid).lean();

  const query = {
    $or: [
      { "players.userId": uid },
      { "players.playerId": uid },
      { playerOneId: uid },
      { playerTwoId: uid },
      { challengerId: uid },
      { opponentId: uid },
    ],
  };

  const raw = await Match.find(query).sort({ updatedAt: -1 }).limit(500).lean();

  const finished = raw.filter((m) => {
    const s = m?.status;
    if (s === undefined || s === null || s === "") return true;
    return isFinishedStatus(s);
  });

  const matchesDesc = [...finished].sort((a, b) => {
    const da = pickPlayedAt(a);
    const db = pickPlayedAt(b);
    const ta = da ? new Date(da).getTime() : 0;
    const tb = db ? new Date(db).getTime() : 0;
    return tb - ta;
  });

  // Persisted user gaming stats are the source of truth for counters.
  const gs = user?.gamingStats || {};
  const gsWins = Number(gs.wins || 0);
  const gsLosses = Number(gs.losses || 0);
  const gsDraws = Number(gs.draws || 0);
  const gsTotal = Number(gs.totalGames || 0);
  const gsGamesPlayed = gsTotal > 0 ? gsTotal : gsWins + gsLosses + gsDraws;
  const gsWinRateRaw = Number(gs.winRate);
  const gsWinRate = Number.isFinite(gsWinRateRaw)
    ? Math.round(gsWinRateRaw * 10) / 10
    : (gsGamesPlayed > 0
        ? Math.round((gsWins / gsGamesPlayed) * 1000) / 10
        : 0);
  const hasPersistedStats =
    gsGamesPlayed > 0 ||
    gsWins > 0 ||
    gsLosses > 0 ||
    gsDraws > 0 ||
    Number(gs.maxStreak || 0) > 0;

  // If no finished matches exist, return persisted stats directly.
  if (!matchesDesc.length) {
    const mmrCandidate = user?.mmr ?? user?.gamingStats?.mmr ?? user?.stats?.mmr ?? null;
    const mmr = Number.isFinite(Number(mmrCandidate)) ? Number(mmrCandidate) : null;

    return {
      userId: uid,
      gamesPlayed: gsGamesPlayed,
      wins: gsWins,
      losses: gsLosses,
      draws: gsDraws,
      winRate: gsWinRate,
      longestStreak: Number(gs.maxStreak || 0),
      avgScore: 0,
      rank: Number.isFinite(Number(user?.rank)) ? Number(user.rank) : null,
      mmr,
    };
  }

  let matchWins = 0;
  let matchLosses = 0;
  let matchDraws = 0;
  let totalScore = 0;
  let scoreCount = 0;

  for (const m of matchesDesc) {
    const players = extractPlayers(m);
    if (players.length > 0 && !players.includes(uid)) continue;

    const winnerId = extractWinnerId(m);

    if (!winnerId) {
      matchDraws += 1;
    } else if (winnerId === uid) {
      matchWins += 1;
    } else {
      matchLosses += 1;
    }

    const myScore = extractScoreForUser(m, uid);
    if (myScore !== null) {
      totalScore += myScore;
      scoreCount += 1;
    }
  }

  const wins = hasPersistedStats ? gsWins : matchWins;
  const losses = hasPersistedStats ? gsLosses : matchLosses;
  const draws = hasPersistedStats ? gsDraws : matchDraws;
  const gamesPlayed = hasPersistedStats ? gsGamesPlayed : wins + losses + draws;
  const winRate = hasPersistedStats
    ? gsWinRate
    : (gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 1000) / 10 : 0);
  const avgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;
  const computedLongestStreak = computeLongestWinStreak(matchesDesc, uid);
  const longestStreak = hasPersistedStats
    ? Math.max(Number(gs.maxStreak || 0), computedLongestStreak)
    : computedLongestStreak;

  const rank = Number.isFinite(Number(user?.rank)) ? Number(user.rank) : null;
  const mmrCandidate = user?.mmr ?? user?.gamingStats?.mmr ?? user?.stats?.mmr ?? null;
  const mmr = Number.isFinite(Number(mmrCandidate)) ? Number(mmrCandidate) : null;

  return {
    userId: uid,
    gamesPlayed,
    wins,
    losses,
    draws,
    winRate,
    longestStreak,
    avgScore,
    rank,
    mmr,
  };
}
