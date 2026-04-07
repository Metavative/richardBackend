// src/modules/economy/economy.controller.js
import User from "../../models/User.js";
import {
  getEconomySnapshot,
  claimCoinsFromXp,
  buyCoinsDev,
} from "../../services/economy.service.js";
import {
  createPayPalOrder,
  capturePayPalOrder,
} from "../../services/paypal.service.js";

const PAYPAL_CURRENCY = String(process.env.PAYPAL_CURRENCY || "GBP")
  .trim()
  .toUpperCase();

const PAYPAL_PACKS = Object.freeze({
  pack_500: { coins: 500, price: 0.99 },
  pack_1200: { coins: 1200, price: 1.99 },
  pack_3000: { coins: 3000, price: 3.99 },
});

function getPack(packId) {
  return PAYPAL_PACKS[String(packId || "").trim()] || null;
}

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
      // Ads are disabled for now.
      // To re-enable from UI later, restore ads.service integration here.
      config: {
        enabled: false,
        cooldownSeconds: 0,
        maxPerDay: 0,
        placements: {},
      },
      eligibility: {
        allowed: false,
        reason: "ads_disabled",
        cooldownRemainingSeconds: 0,
        remainingToday: 0,
        maxPerDay: 0,
      },
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

    const { packId } = req.body || {};
    if (!packId) {
      return res.fail("packId is required", 400);
    }

    const pack = getPack(packId);
    if (!pack) {
      return res.fail("Unknown packId", 400);
    }

    // In-app WebView redirect targets (WebView intercepts these)
    const returnUrl = "yourapp://paypal/success";
    const cancelUrl = "yourapp://paypal/cancel";

    const order = await createPayPalOrder({
      price: pack.price,
      currencyCode: PAYPAL_CURRENCY,
      customId: `${userId}:${packId}`,
      returnUrl,
      cancelUrl,
    });

    const approvalUrl = (order.links || []).find((l) => l.rel === "approve")?.href;
    if (!approvalUrl) return res.fail("No approval link returned by PayPal", 500);

    return res.ok({
      orderId: order.id,
      approvalUrl,
      packId,
      coins: pack.coins,
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

    const { orderId, packId } = req.body || {};
    if (!orderId || !packId) {
      return res.fail("orderId, packId are required", 400);
    }

    const pack = getPack(packId);
    if (!pack) {
      return res.fail("Unknown packId", 400);
    }

    const capture = await capturePayPalOrder(orderId);
    if (capture?.status !== "COMPLETED") {
      return res.fail(`Payment status: ${capture?.status || "FAILED"}`, 400);
    }

    const purchaseUnit = capture?.purchase_units?.[0] || {};
    const orderAmount = purchaseUnit?.amount || {};
    const captures = purchaseUnit?.payments?.captures || [];
    const captureAmount = captures[0]?.amount || orderAmount;

    const paidCurrency = String(captureAmount?.currency_code || "").toUpperCase();
    const paidValue = Number(captureAmount?.value);
    const expectedValue = Number(pack.price);

    if (
      !Number.isFinite(paidValue) ||
      paidCurrency !== PAYPAL_CURRENCY ||
      paidValue.toFixed(2) !== expectedValue.toFixed(2)
    ) {
      return res.fail("Captured amount/currency mismatch", 400);
    }

    const expectedCustomId = `${userId}:${packId}`;
    const customId = String(purchaseUnit?.custom_id || "").trim();
    if (customId && customId !== expectedCustomId) {
      return res.fail("Order does not belong to this user/pack", 400);
    }

    // Credit coins from trusted server-side pack config.
    await buyCoinsDev(userId, { packId });

    const snap = await getEconomySnapshot(userId);
    return res.ok({
      success: true,
      message: "Payment captured and coins added!",
      economy: snap,
    });
  } catch (error) {
    console.error("PAYPAL_CAPTURE_ERROR:", error?.response?.data || error);
    return res.fail("Could not verify payment with PayPal", 500);
  }
}
