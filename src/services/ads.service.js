// src/services/ads.service.js
import AdEvent from "../models/AdEvent.js";
import User from "../models/User.js";

function dayKey(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === "true";
}

function envInt(name, fallback) {
  const v = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) ? v : fallback;
}

export async function getAdsConfigForUser(userId, { user } = {}) {
  // Global switches
  const enabled = envBool("ADS_ENABLED", true);
  const cooldownSeconds = envInt("ADS_INTERSTITIAL_COOLDOWN_SECONDS", 90);
  const maxPerDay = envInt("ADS_INTERSTITIAL_MAX_PER_DAY", 20);

  // If caller didn't pass user, fetch only entitlements
  const u =
    user ??
    (await User.findById(userId).select("entitlements").lean());

  const adFree = u?.entitlements?.adFree === true;

  return {
    enabled: enabled && !adFree,
    cooldownSeconds,
    maxPerDay,
    placements: {
      between_matches: { adType: "interstitial" },
    },
  };
}

/**
 * Returns whether the user is allowed to show an interstitial now,
 * based on cooldown + daily cap + entitlements.
 */
export async function getInterstitialEligibility({ userId, placement, user }) {
  const cfg = await getAdsConfigForUser(userId, { user });

  if (!cfg.enabled) {
    return {
      allowed: false,
      reason: "disabled_or_adfree",
      cooldownRemainingSeconds: 0,
      remainingToday: 0,
      maxPerDay: cfg.maxPerDay,
    };
  }

  const today = dayKey();
  const now = Date.now();

  // Daily count based on "shown" events
  const shownToday = await AdEvent.countDocuments({
    userId,
    placement,
    event: "shown",
    createdDay: today,
  });

  const remainingToday = Math.max(0, cfg.maxPerDay - shownToday);
  if (remainingToday <= 0) {
    return {
      allowed: false,
      reason: "daily_cap",
      cooldownRemainingSeconds: 0,
      remainingToday,
      maxPerDay: cfg.maxPerDay,
    };
  }

  // Cooldown based on last "shown"
  const lastShown = await AdEvent.findOne({
    userId,
    placement,
    event: "shown",
  })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();

  if (lastShown?.createdAt) {
    const last = new Date(lastShown.createdAt).getTime();
    const elapsed = Math.floor((now - last) / 1000);
    const remaining = Math.max(0, cfg.cooldownSeconds - elapsed);

    if (remaining > 0) {
      return {
        allowed: false,
        reason: "cooldown",
        cooldownRemainingSeconds: remaining,
        remainingToday,
        maxPerDay: cfg.maxPerDay,
      };
    }
  }

  return {
    allowed: true,
    reason: "ok",
    cooldownRemainingSeconds: 0,
    remainingToday,
    maxPerDay: cfg.maxPerDay,
  };
}

export async function logAdEvent({
  userId,
  placement,
  adType,
  event,
  provider,
  meta,
}) {
  const createdDay = dayKey();
  const doc = await AdEvent.create({
    userId,
    placement,
    adType: adType || "interstitial",
    event,
    provider: provider || "unknown",
    meta: meta || {},
    createdDay,
  });

  return doc;
}
