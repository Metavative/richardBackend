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

function getAuthedUserId(req) {
  return (
    req?.userId ||
    req?.user?.sub ||
    req?.user?.userId ||
    req?.user?.id ||
    null
  );
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

  // Ads config (optional but already wired)
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
// POST /economy/buy-coins  (DEV ONLY)
// ---------------------------------------------------------------------------
export async function buyCoins(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    throw err;
  }

  const { packId, coins, price } = req.body || {};

  if (!packId) {
    const err = new Error("packId is required");
    err.status = 400;
    throw err;
  }

  const result = await buyCoinsDev(userId, {
    packId,
    coins,
    price,
  });

  return res.ok({
    userId: result.userId,
    purchased: result.purchased,
    economy: result.snapshot,
  });
}
