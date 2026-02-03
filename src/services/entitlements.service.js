import mongoose from "mongoose";
import User from "../models/User.js";
import PointsLedger from "../models/PointsLedger.js";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function buyEntitlementWithCoins({
  userId,
  entitlementKey, // "adFree" | "premiumAI"
  priceCoins,
  source,
}) {
  const uid = String(userId || "");
  if (!uid) throw new Error("buyEntitlementWithCoins: missing userId");

  const cost = Math.max(0, num(priceCoins, 0));
  if (cost <= 0) {
    const err = new Error("Invalid priceCoins");
    err.status = 400;
    err.code = "BAD_REQUEST";
    throw err;
  }

  const user = await User.findById(uid);
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  user.entitlements = user.entitlements || {};
  user.economy = user.economy || {};

  // Already owned
  if (user.entitlements?.[entitlementKey] === true) {
    return {
      userId: uid,
      ok: true,
      message: "Already owned",
      entitlements: user.entitlements,
      economy: {
        coinsBalance: num(user.economy.coinsBalance, 0),
      },
    };
  }

  const currentCoins = num(user.economy.coinsBalance, 0);
  if (currentCoins < cost) {
    const err = new Error("Not enough coins");
    err.status = 400;
    err.code = "NOT_ENOUGH_COINS";
    throw err;
  }

  // Idempotency ledger
  const refId = `${entitlementKey}:${cost}`;

  try {
    await PointsLedger.create({
      userId: user._id,
      source,
      refId,
      pointsDelta: 0,
      coinsDelta: -cost,
      meta: { entitlementKey, cost },
    });
  } catch (_) {
    // duplicate => treat as no-op (already purchased)
    return {
      userId: uid,
      ok: true,
      message: "Already processed",
      entitlements: user.entitlements,
      economy: { coinsBalance: currentCoins },
    };
  }

  // Apply
  user.economy.coinsBalance = Math.max(0, currentCoins - cost);
  user.entitlements[entitlementKey] = true;

  await user.save();

  return {
    userId: uid,
    ok: true,
    message: "Purchased",
    entitlements: user.entitlements,
    economy: { coinsBalance: user.economy.coinsBalance },
  };
}
