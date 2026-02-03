import User from "../../models/User.js";
import { buyEntitlementWithCoins } from "../../services/entitlements.service.js";

function getAuthedUserId(req) {
  return (
    req?.userId ||
    req?.user?.sub ||
    req?.user?.userId ||
    req?.user?.id ||
    null
  );
}

export async function getMyEntitlements(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }

  const user = await User.findById(userId).select("entitlements");
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  return res.ok({
    entitlements: {
      adFree: user.entitlements?.adFree === true,
      premiumAI: user.entitlements?.premiumAI === true,
    },
  });
}

export async function buyAdFree(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }

  const priceCoins = Number(req.body?.priceCoins ?? 0);

  const result = await buyEntitlementWithCoins({
    userId,
    entitlementKey: "adFree",
    priceCoins,
    source: "ENTITLEMENT_ADFREE",
  });

  return res.ok(result);
}

export async function buyPremiumAi(req, res) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }

  const priceCoins = Number(req.body?.priceCoins ?? 0);

  const result = await buyEntitlementWithCoins({
    userId,
    entitlementKey: "premiumAI",
    priceCoins,
    source: "ENTITLEMENT_PREMIUM_AI",
  });

  return res.ok(result);
}
