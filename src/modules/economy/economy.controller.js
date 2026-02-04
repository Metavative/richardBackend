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
  return req?.userId || req?.user?.sub || req?.user?.userId || req?.user?.id || null;
}

// ---------------------------------------------------------------------------
// GET /economy/me
// ---------------------------------------------------------------------------
export async function getMyEconomy(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) return res.fail("UNAUTHORIZED", 401);

  const user = await User.findById(userId).select(
    "name username economy gamingStats cosmetics entitlements"
  );

  if (!user) return res.fail("USER_NOT_FOUND", 404);

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
  if (!userId) return res.fail("UNAUTHORIZED", 401);

  const result = await claimCoinsFromXp(userId);

  return res.ok({
    userId: result.userId,
    claimedCoins: result.claimedCoins,
    message: result.message,
    economy: result.snapshot,
  });
}

// ---------------------------------------------------------------------------
// POST /economy/buy-coins  (PayPal Create Order)
// ---------------------------------------------------------------------------
export async function buyCoins(req, res) {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) return res.fail("UNAUTHORIZED", 401);

    const { packId, coins, price } = req.body || {};
    if (!packId || !coins || !price) {
      return res.fail("packId, coins, price are required", 400);
    }

    // ✅ In-app WebView redirect targets (WebView intercepts these)
    const returnUrl = "yourapp://paypal/success";
    const cancelUrl = "yourapp://paypal/cancel";

    const order = await createPayPalOrder({
      price,
      returnUrl,
      cancelUrl,
    });

    const approvalUrl = (order.links || []).find((l) => l.rel === "approve")?.href;
    if (!approvalUrl) return res.fail("No approval link returned by PayPal", 500);

    return res.ok({
      orderId: order.id,
      approvalUrl,
    });
  } catch (error) {
    console.error("PAYPAL_CREATE_ERROR:", error?.response?.data || error);
    return res.fail("Failed to initiate PayPal order", 500);
  }
}

// ---------------------------------------------------------------------------
// POST /economy/capture-order  (PayPal Capture + credit coins)
// ---------------------------------------------------------------------------
export async function captureOrder(req, res) {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) return res.fail("UNAUTHORIZED", 401);

    const { orderId, packId, coins } = req.body || {};
    if (!orderId || !packId || !coins) {
      return res.fail("orderId, packId, coins are required", 400);
    }

    const capture = await capturePayPalOrder(orderId);

    if (capture?.status === "COMPLETED") {
      // ✅ credit coins (your existing dev method)
      await buyCoinsDev(userId, { packId, coins });

      const snap = await getEconomySnapshot(userId);

      return res.ok({
        success: true,
        message: "Payment captured and coins added!",
        economy: snap,
      });
    }

    return res.fail(`Payment status: ${capture?.status || "FAILED"}`, 400);
  } catch (error) {
    console.error("PAYPAL_CAPTURE_ERROR:", error?.response?.data || error);
    return res.fail("Could not verify payment with PayPal", 500);
  }
}
