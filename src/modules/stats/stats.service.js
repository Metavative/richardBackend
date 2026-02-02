// src/modules/stats/stats.service.js
import Match from "../../models/Match.js";
import { User } from "../../models/User.js";

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

/**
 * Try to read player scores from a match in a flexible way.
 * Supports:
 *  - match.scores: [{ userId, score }]
 *  - match.result.scores: [{ userId, score }]
 *  - match.settings.winningScore etc (ignored)
 */
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

  // Sometimes score is stored as match.scoreByUserId map
  const map = match?.scoreByUserId || match?.scoresByUserId;
  if (map && typeof map === "object") {
    const val = map[uid];
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function extractWinnerId(match) {
  // Common patterns:
  // match.winner, match.winnerId, match.result.winnerId, match.result.winner
  const w =
    match?.winnerId ??
    match?.winner ??
    match?.result?.winnerId ??
    match?.result?.winner ??
    match?.match?.winnerId ??
    match?.match?.winner;

  // Draw may be "draw" or null
  if (!w) return null;
  const s = toId(w);
  if (!s || s.toLowerCase() === "draw") return null;
  return s;
}

function extractPlayers(match) {
  // Common patterns:
  // match.players: [userId] or [{userId}] or [{user:{_id}}]
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
    const isDraw = !winnerId;

    if (isWin) {
      current += 1;
      if (current > longest) longest = current;
      continue;
    }

    // draws break the streak for "win streak" (keep it simple)
    current = 0;

    // losses also break
    if (!isDraw) {
      current = 0;
    }
  }

  return longest;
}

export async function getMyStats(userId) {
  const uid = toId(userId);
  if (!uid) throw new Error("User ID missing");

  // Load user for optional mmr/rank
  const user = await User.findById(uid).lean();

  // Query matches where user participated
  // We keep this flexible: match.players contains userId OR match.playerOneId/playerTwoId patterns
  const query = {
    $or: [
      { players: uid },
      { "players.userId": uid },
      { "players.playerId": uid },
      { playerOneId: uid },
      { playerTwoId: uid },
      { challengerId: uid },
      { opponentId: uid },
    ],
  };

  const raw = await Match.find(query).sort({ updatedAt: -1 }).limit(500).lean();

  // Filter "finished" only if status is present; if status missing, accept it
  const finished = raw.filter((m) => {
    const s = m?.status;
    if (s === undefined || s === null || s === "") return true;
    return isFinishedStatus(s);
  });

  // Sort by playedAt/endedAt/updatedAt descending for streak computation
  const matchesDesc = [...finished].sort((a, b) => {
    const da = pickPlayedAt(a);
    const db = pickPlayedAt(b);
    const ta = da ? new Date(da).getTime() : 0;
    const tb = db ? new Date(db).getTime() : 0;
    return tb - ta;
  });

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalScore = 0;
  let scoreCount = 0;

  for (const m of matchesDesc) {
    const players = extractPlayers(m);
    // If players list exists and doesn't include uid, ignore (safety)
    if (players.length > 0 && !players.includes(uid)) continue;

    const winnerId = extractWinnerId(m);

    if (!winnerId) {
      draws += 1;
    } else if (winnerId === uid) {
      wins += 1;
    } else {
      losses += 1;
    }

    const myScore = extractScoreForUser(m, uid);
    if (myScore !== null) {
      totalScore += myScore;
      scoreCount += 1;
    }
  }

  const gamesPlayed = wins + losses + draws;
  const winRate =
    gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 1000) / 10 : 0; // one decimal
  const avgScore =
    scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0;
  const longestStreak = computeLongestWinStreak(matchesDesc, uid);

  // Optional rank/mmr from user (support both "mmr" and "gamingStats.mmr")
  const rank = Number.isFinite(Number(user?.rank)) ? Number(user.rank) : null;

  const mmrCandidate =
    user?.mmr ??
    user?.gamingStats?.mmr ??
    user?.stats?.mmr ??
    null;

  const mmr = Number.isFinite(Number(mmrCandidate)) ? Number(mmrCandidate) : null;

  return {
    userId: uid,
    gamesPlayed,
    wins,
    losses,
    draws,
    winRate, // percent
    longestStreak, // win streak
    avgScore, // if scores exist in matches
    rank,
    mmr,
  };
}
