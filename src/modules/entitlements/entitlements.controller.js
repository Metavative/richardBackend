import User from "../../models/User.js";

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
    userId: user._id.toString(),
    entitlements: {
      adFree: user.entitlements?.adFree === true,
      premiumAI: user.entitlements?.premiumAI === true,
    },
  });
}

/**
 * DEV/ADMIN endpoint for now.
 * Later, this will be triggered by a real purchase receipt verification.
 */
export async function unlockAdFree(req, res) {
  const userId = getAuthedUserId(req);

  if (!userId) {
    const err = new Error("UNAUTHORIZED");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }

  const value = req?.body?.adFree;
  const adFree = value === undefined ? true : value === true;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { "entitlements.adFree": adFree } },
    { new: true }
  ).select("entitlements");

  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  return res.ok({
    userId: user._id.toString(),
    entitlements: {
      adFree: user.entitlements?.adFree === true,
      premiumAI: user.entitlements?.premiumAI === true,
    },
    message: adFree ? "Ad-free unlocked" : "Ad-free disabled",
  });
}
