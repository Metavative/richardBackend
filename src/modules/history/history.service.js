// src/modules/history/history.service.js
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

function extractScorePair(match) {
  // flexible score formats
  const candidates = [match?.scores, match?.result?.scores, match?.match?.scores];

  // return array like [{userId, score}]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      const mapped = c
        .map((x) => ({
          userId: toId(x?.userId || x?.playerId),
          score: Number(x?.score ?? x?.points ?? 0),
        }))
        .filter((x) => x.userId);
      if (mapped.length) return mapped;
    }
  }

  const map = match?.scoreByUserId || match?.scoresByUserId;
  if (map && typeof map === "object") {
    const out = [];
    for (const [k, v] of Object.entries(map)) {
      const n = Number(v);
      out.push({ userId: toId(k), score: Number.isFinite(n) ? n : 0 });
    }
    return out;
  }

  return [];
}

function guessOpponentId(match, myId) {
  const uid = toId(myId);
  // common patterns
  const direct = [
    match?.playerOneId,
    match?.playerTwoId,
    match?.challengerId,
    match?.opponentId,
  ]
    .map(toId)
    .filter(Boolean);

  if (direct.length >= 2) {
    const other = direct.find((x) => x !== uid);
    if (other) return other;
  }

  const players = extractPlayers(match);
  if (players.length) {
    const other = players.find((x) => x !== uid);
    if (other) return other;
  }

  return null;
}

export async function getMyHistory(userId, { limit = 25 } = {}) {
  const uid = toId(userId);
  if (!uid) throw new Error("User ID missing");

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

  const raw = await Match.find(query).sort({ updatedAt: -1 }).limit(limit).lean();

  // keep finished only when status exists; if missing, keep it (flex)
  const finished = raw.filter((m) => {
    const s = m?.status;
    if (s === undefined || s === null || s === "") return true;
    return isFinishedStatus(s);
  });

  // collect opponentIds and fetch names in one go
  const opponentIds = new Set();
  for (const m of finished) {
    const opp = guessOpponentId(m, uid);
    if (opp) opponentIds.add(opp);
  }

  const users = opponentIds.size
    ? await User.find({ _id: { $in: Array.from(opponentIds) } })
        .select("username name email phone")
        .lean()
    : [];

  const nameById = new Map();
  for (const u of users) {
    const id = toId(u?._id);
    const n =
      (u?.username && u.username.trim()) ||
      (u?.name && u.name.trim()) ||
      (u?.email && u.email.trim()) ||
      (u?.phone && u.phone.trim()) ||
      "Player";
    nameById.set(id, n);
  }

  const matches = finished.map((m) => {
    const matchId = toId(m?._id || m?.id);
    const playedAt = pickPlayedAt(m);

    const winnerId = extractWinnerId(m);
    const isDraw = !winnerId;
    const result = isDraw ? "draw" : winnerId === uid ? "won" : "lost";

    const oppId = guessOpponentId(m, uid);
    const opponentName = oppId ? (nameById.get(oppId) || "Player") : "Player";

    const scores = extractScorePair(m);

    const myScore =
      scores.find((s) => toId(s.userId) === uid)?.score ?? null;
    const oppScore =
      oppId ? (scores.find((s) => toId(s.userId) === toId(oppId))?.score ?? null) : null;

    return {
      matchId,
      playedAt,
      result, // "won" | "lost" | "draw"
      opponentId: oppId,
      opponentName,
      myScore,
      opponentScore: oppScore,
    };
  });

  return { matches };
}
