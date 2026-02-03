// src/services/economy.service.js
import mongoose from "mongoose";
import User from "../models/User.js";
import PointsLedger from "../models/PointsLedger.js";
import { checkAndUnlockAchievements } from "./achievements.service.js";

const ECON = {
  // Match XP/points
  WIN_POINTS: 30,
  LOSS_POINTS: 12,
  DRAW_POINTS: 18,

  // streak bonus: +5 per win in streak, cap +25
  STREAK_BONUS_PER_WIN: 5,
  STREAK_BONUS_CAP: 25,

  // ✅ Coins are NOT auto-awarded from match points anymore.
  // ✅ Coins are "claimable" only when lifetimePointsEarned crosses thresholds.
  COIN_CLAIM_STEP_POINTS: 100, // every 100 XP earned...
  COINS_PER_CLAIM_STEP: 10, // ...claim 10 coins
};

function toStr(v) {
  try {
    return v?.toString?.() || "";
  } catch {
    return "";
  }
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calcStreakBonus(newStreak) {
  const raw = ECON.STREAK_BONUS_PER_WIN * Math.max(0, Number(newStreak || 0));
  return Math.min(ECON.STREAK_BONUS_CAP, raw);
}

function computeClaimableCoinsFromUser(user) {
  const lifetime = num(user?.economy?.lifetimePointsEarned, 0);

  // ✅ You MUST add this field to the User schema:
  // economy.lastCoinClaimPoints: { type: Number, default: 0 }
  const lastClaimPts = num(user?.economy?.lastCoinClaimPoints, 0);

  const delta = Math.max(0, lifetime - lastClaimPts);
  const steps = Math.floor(delta / ECON.COIN_CLAIM_STEP_POINTS);
  const claimableCoins = steps * ECON.COINS_PER_CLAIM_STEP;

  const nextClaimAtPoints =
    claimableCoins > 0 ? lifetime : lastClaimPts + ECON.COIN_CLAIM_STEP_POINTS;

  return {
    claimableCoins,
    steps,
    lastClaimPts,
    lifetimePointsEarned: lifetime,
    nextClaimAtPoints,
    claimStepPoints: ECON.COIN_CLAIM_STEP_POINTS,
    coinsPerStep: ECON.COINS_PER_CLAIM_STEP,
  };
}

/**
 * Returns economy snapshot used by Flutter:
 * - balances
 * - claimable coins (based on lifetimePointsEarned thresholds)
 */
export async function getEconomySnapshot(userId) {
  const uid = toStr(userId);
  if (!uid) throw new Error("getEconomySnapshot: missing userId");

  const user = await User.findById(uid).lean();
  if (!user) throw new Error("getEconomySnapshot: user not found");

  const econ = user.economy || {};
  const claim = computeClaimableCoinsFromUser(user);

  return {
    userId: uid,
    pointsBalance: num(econ.pointsBalance, 0),
    coinsBalance: num(econ.coinsBalance, 0),
    lifetimePointsEarned: claim.lifetimePointsEarned,
    lifetimeCoinsEarned: num(econ.lifetimeCoinsEarned, 0),

    // claim UI support
    claimableCoins: claim.claimableCoins,
    claimableNow: claim.claimableCoins > 0,
    nextClaimAtPoints: claim.nextClaimAtPoints,
    claimStepPoints: claim.claimStepPoints,
    coinsPerStep: claim.coinsPerStep,
    lastCoinClaimPoints: claim.lastClaimPts,
  };
}

/**
 * ✅ Coins can be collected only when XP thresholds are met.
 * Idempotent via ledger:
 * - source: COIN_CLAIM
 * - refId: coin_claim:<lastCoinClaimPoints>-><newLastCoinClaimPoints>
 */
export async function claimCoinsFromXp(userId) {
  const uid = toStr(userId);
  if (!uid) throw new Error("claimCoinsFromXp: missing userId");

  const user = await User.findById(uid);
  if (!user) throw new Error("claimCoinsFromXp: user not found");

  // Ensure economy object exists
  user.economy = user.economy || {};

  const claim = computeClaimableCoinsFromUser(user);
  if (claim.claimableCoins <= 0) {
    return {
      userId: uid,
      claimedCoins: 0,
      message: "Not eligible to claim coins yet",
      snapshot: await getEconomySnapshot(uid),
    };
  }

  // Determine how many points we advance the claim marker by
  const pointsAdvanced = claim.steps * ECON.COIN_CLAIM_STEP_POINTS;
  const newLastClaimPoints = claim.lastClaimPts + pointsAdvanced;

  const refId = `coin_claim:${claim.lastClaimPts}->${newLastClaimPoints}`;

  // Ledger prevents duplicates
  try {
    await PointsLedger.create({
      userId: user._id,
      source: "COIN_CLAIM",
      refId,
      pointsDelta: 0,
      coinsDelta: claim.claimableCoins,
      meta: {
        lastClaimPts: claim.lastClaimPts,
        newLastClaimPoints,
        steps: claim.steps,
        claimStepPoints: ECON.COIN_CLAIM_STEP_POINTS,
        coinsPerStep: ECON.COINS_PER_CLAIM_STEP,
      },
    });
  } catch (_) {
    // Duplicate claim attempt => treat as no-op
    return {
      userId: uid,
      claimedCoins: 0,
      message: "Already claimed",
      snapshot: await getEconomySnapshot(uid),
    };
  }

  // Apply balances
  user.economy.coinsBalance = Math.max(
    0,
    num(user.economy.coinsBalance, 0) + claim.claimableCoins
  );
  user.economy.lifetimeCoinsEarned =
    num(user.economy.lifetimeCoinsEarned, 0) + claim.claimableCoins;

  // Move the claim marker forward
  user.economy.lastCoinClaimPoints = newLastClaimPoints;

  await user.save();

  return {
    userId: uid,
    claimedCoins: claim.claimableCoins,
    message: "Coins claimed",
    snapshot: await getEconomySnapshot(uid),
  };
}

/**
 * Idempotent award for a match result.
 * ✅ Awards POINTS only (coins are now collected via claim system).
 * Ledger keys:
 * - MATCH_WIN + refId = match:<matchId>
 * - MATCH_LOSS + refId = match:<matchId>
 */
export async function awardMatchResult({
  matchId,
  winnerId,
  loserId,
  reason = "normal",
}) {
  const matchKey = toStr(matchId);
  const winUid = toStr(winnerId);
  const loseUid = toStr(loserId);

  if (!matchKey) throw new Error("awardMatchResult: missing matchId");
  if (!winUid) throw new Error("awardMatchResult: missing winnerId");
  if (!loseUid) throw new Error("awardMatchResult: missing loserId");

  const winObjId = new mongoose.Types.ObjectId(winUid);
  const loseObjId = new mongoose.Types.ObjectId(loseUid);

  const [winner, loser] = await Promise.all([
    User.findById(winObjId),
    User.findById(loseObjId),
  ]);
  if (!winner || !loser) throw new Error("awardMatchResult: winner/loser not found");

  // -----------------------
  // Stats
  // -----------------------
  winner.gamingStats = winner.gamingStats || {};
  loser.gamingStats = loser.gamingStats || {};
  winner.economy = winner.economy || {};
  loser.economy = loser.economy || {};

  winner.gamingStats.wins = (winner.gamingStats.wins || 0) + 1;

  const prevStreak = Number(winner.gamingStats.streak || 0);
  const newStreak = prevStreak > 0 ? prevStreak + 1 : 1;
  winner.gamingStats.streak = newStreak;
  winner.gamingStats.maxStreak = Math.max(
    Number(winner.gamingStats.maxStreak || 0),
    newStreak
  );

  loser.gamingStats.losses = (loser.gamingStats.losses || 0) + 1;
  loser.gamingStats.streak = 0;

  // -----------------------
  // Economy: POINTS ONLY
  // -----------------------
  const streakBonus = calcStreakBonus(newStreak);
  const winnerPoints = ECON.WIN_POINTS + streakBonus;
  const loserPoints = ECON.LOSS_POINTS;

  winner.economy.pointsBalance = Math.max(
    0,
    (winner.economy.pointsBalance || 0) + winnerPoints
  );
  loser.economy.pointsBalance = Math.max(
    0,
    (loser.economy.pointsBalance || 0) + loserPoints
  );

  winner.economy.lifetimePointsEarned =
    (winner.economy.lifetimePointsEarned || 0) + winnerPoints;
  loser.economy.lifetimePointsEarned =
    (loser.economy.lifetimePointsEarned || 0) + loserPoints;

  winner.lastMatchAt = new Date();
  loser.lastMatchAt = new Date();

  // -----------------------
  // Ledgers (idempotent)
  // -----------------------
  const refId = `match:${matchKey}`;
  let winnerLedgerCreated = false;
  let loserLedgerCreated = false;

  try {
    await PointsLedger.create({
      userId: winner._id,
      source: "MATCH_WIN",
      refId,
      pointsDelta: winnerPoints,
      coinsDelta: 0,
      meta: {
        matchId: matchKey,
        reason,
        streakBonus,
        streak: newStreak,
        opponentId: loser._id.toString(),
      },
    });
    winnerLedgerCreated = true;
  } catch (_) {}

  try {
    await PointsLedger.create({
      userId: loser._id,
      source: "MATCH_LOSS",
      refId,
      pointsDelta: loserPoints,
      coinsDelta: 0,
      meta: { matchId: matchKey, reason, opponentId: winner._id.toString() },
    });
    loserLedgerCreated = true;
  } catch (_) {}

  if (winnerLedgerCreated || loserLedgerCreated) {
    await Promise.all([winner.save(), loser.save()]);
  }

  // -----------------------
  // Achievements (idempotent)
  // -----------------------
  const [winnerAch, loserAch] = await Promise.all([
    checkAndUnlockAchievements(winner._id, { reason: `match:${matchKey}` }),
    checkAndUnlockAchievements(loser._id, { reason: `match:${matchKey}` }),
  ]);

  return {
    matchId: matchKey,
    winner: {
      userId: winner._id.toString(),
      pointsAwarded: winnerLedgerCreated ? winnerPoints : 0,
      coinsAwarded: 0,
      streakBonus,
      unlockedAchievements: winnerAch.unlocked,
    },
    loser: {
      userId: loser._id.toString(),
      pointsAwarded: loserLedgerCreated ? loserPoints : 0,
      coinsAwarded: 0,
      unlockedAchievements: loserAch.unlocked,
    },
  };
}

/**
 * ✅ DEV coin purchase: credits coins immediately.
 * IMPORTANT: Server-side allowlist to prevent spoofing.
 * Later you replace this with IAP receipt validation.
 */
export async function buyCoinsDev(userId, { packId, coins, price }) {
  const uid = toStr(userId);
  if (!uid) throw new Error("buyCoinsDev: missing userId");

  const PACKS = {
    pack_500: { coins: 500, price: 0.99 },
    pack_1200: { coins: 1200, price: 1.99 },
    pack_3000: { coins: 3000, price: 3.99 },
  };

  const pack = PACKS[String(packId || "")];
  if (!pack) {
    const err = new Error("Unknown packId");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }

  // Optional sanity checks (don’t trust client)
  if (typeof coins === "number" && coins !== pack.coins) {
    const err = new Error("Coins mismatch");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }
  if (typeof price === "number" && price !== pack.price) {
    const err = new Error("Price mismatch");
    err.code = "BAD_REQUEST";
    err.status = 400;
    throw err;
  }

  const user = await User.findById(uid);
  if (!user) throw new Error("buyCoinsDev: user not found");

  user.economy = user.economy || {};

  user.economy.coinsBalance = Math.max(
    0,
    num(user.economy.coinsBalance, 0) + pack.coins
  );
  user.economy.lifetimeCoinsEarned =
    num(user.economy.lifetimeCoinsEarned, 0) + pack.coins;

  await user.save();

  return {
    userId: uid,
    purchased: { packId, coins: pack.coins, price: pack.price },
    snapshot: await getEconomySnapshot(uid),
  };
}
