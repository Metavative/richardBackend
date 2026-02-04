// src/modules/economy/economy.controller.js
import User from "../../models/User.js";
import {
  getEconomySnapshot,
  claimCoinsFromXp,
  buyCoinsDev,
} from "../../services/economy.service.js";
import {
  getAdsConfigForUser,
  getInterstitialEligibility,
} from "../../services/ads.service.js";
import {
  createPayPalOrder,
  capturePayPalOrder,
} from "../../services/paypal.service.js";

function getAuthedUserId(req) {
  return (
    req?.userId ||
    req?.user?.sub ||
    req?.user?.userId ||
    req?.user?.id ||
    null
  );
}

function safeMsg(err) {
  return err?.message?.toString?.() || "UNKNOWN_ERROR";
}

// ---------------------------------------------------------------------------
// GET /economy/me
// ---------------------------------------------------------------------------
export async function getMyEconomy(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    throw err;
  }

  const user = await User.findById(userId).select(
    "name username economy gamingStats cosmetics entitlements"
  );

  if (!user) {
    const err = new Error("USER_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const snap = await getEconomySnapshot(user._id);

  const adsConfig = await getAdsConfigForUser(user._id);
  const adsEligibility = await getInterstitialEligibility({
    userId: user._id,
    placement: "between_matches",
  });

  return res.ok({
    userId: user._id.toString(),

    profile: {
      name: user.name,
      username: user.username,
      cosmetics: user.cosmetics || {
        appliedBoardId: "",
        appliedPiecesId: "",
      },
    },

    entitlements: {
      adFree: user.entitlements?.adFree === true,
      premiumAI: user.entitlements?.premiumAI === true,
    },

    ads: {
      config: adsConfig,
      eligibility: adsEligibility,
    },

    economy: {
      pointsBalance: snap.pointsBalance,
      coinsBalance: snap.coinsBalance,
      lifetimePointsEarned: snap.lifetimePointsEarned,
      lifetimeCoinsEarned: snap.lifetimeCoinsEarned,
      claimableCoins: snap.claimableCoins,
      claimableNow: snap.claimableNow,
      nextClaimAtPoints: snap.nextClaimAtPoints,
      claimStepPoints: snap.claimStepPoints,
      coinsPerStep: snap.coinsPerStep,
      lastCoinClaimPoints: snap.lastCoinClaimPoints,
    },

    stats: {
      wins: user.gamingStats?.wins ?? 0,
      losses: user.gamingStats?.losses ?? 0,
      draws: user.gamingStats?.draws ?? 0,
      totalGames: user.gamingStats?.totalGames ?? 0,
      winRate: user.gamingStats?.winRate ?? 0,
      streak: user.gamingStats?.streak ?? 0,
      maxStreak: user.gamingStats?.maxStreak ?? 0,
      mmr: user.gamingStats?.mmr ?? 1000,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /economy/claim
// ---------------------------------------------------------------------------
export async function claimMyCoins(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    throw err;
  }

  const result = await claimCoinsFromXp(userId);

  return res.ok({
    userId: result.userId,
    claimedCoins: result.claimedCoins,
    message: result.message,
    economy: result.snapshot,
  });
}

// ---------------------------------------------------------------------------
// POST /economy/buy-coins  (PAYPAL CREATE ORDER)
// ---------------------------------------------------------------------------
export async function buyCoins(req, res) {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) return res.fail("UNAUTHORIZED");

    const { packId, coins, price } = req.body || {};

    if (!packId) return res.fail("packId is required");
    if (coins == null) return res.fail("coins is required");
    if (price == null) return res.fail("price is required");

    const publicBase =
      process.env.PUBLIC_BASE_URL ||
      "https://richardbackend-production-a5dc.up.railway.app";

    const order = await createPayPalOrder({
      priceUsd: price,
      returnUrl: `${publicBase}/paypal-success`,
      cancelUrl: `${publicBase}/paypal-cancel`,
      brandName: process.env.APP_BRAND_NAME || "Checkers",
    });

    const links = Array.isArray(order?.links) ? order.links : [];
    const approvalUrl = links.find((l) => l.rel === "approve")?.href;

    if (!approvalUrl) {
      console.error("PAYPAL_ORDER_NO_APPROVE_LINK:", order);
      return res.fail("PayPal approval link missing");
    }

    return res.ok({
      orderId: order.id,
      approvalUrl,
      packId,
      coins,
      price,
    });
  } catch (error) {
    console.error(
      "PAYPAL_CREATE_ORDER_ERROR:",
      safeMsg(error),
      error?.details || error
    );
    return res.fail(`Failed to initiate PayPal order: ${safeMsg(error)}`);
  }
}

// ---------------------------------------------------------------------------
// POST /economy/capture-payment (PAYPAL CAPTURE + CREDIT COINS)
// ---------------------------------------------------------------------------
export async function captureOrder(req, res) {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) return res.fail("UNAUTHORIZED");

    const { orderId, packId, coins, price } = req.body || {};

    if (!orderId) return res.fail("orderId is required");
    if (!packId) return res.fail("packId is required");
    if (coins == null) return res.fail("coins is required");

    const capture = await capturePayPalOrder(orderId);

    const status = capture?.status;
    if (status !== "COMPLETED") {
      return res.fail(`Payment status: ${status || "FAILED"}`);
    }

    await buyCoinsDev(userId, { packId, coins, price });
    const snap = await getEconomySnapshot(userId);

    return res.ok({
      success: true,
      message: "Payment captured and coins added!",
      economy: snap,
    });
  } catch (error) {
    console.error(
      "PAYPAL_CAPTURE_ERROR:",
      safeMsg(error),
      error?.details || error
    );
    return res.fail(`Could not verify payment with PayPal: ${safeMsg(error)}`);
  }
}
