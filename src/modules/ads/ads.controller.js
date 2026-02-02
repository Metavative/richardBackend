// src/modules/ads/ads.controller.js
import {
    getAdsConfigForUser,
    getInterstitialEligibility,
    logAdEvent,
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
  
  // Keep these tight for now. Expand later when you add more placements.
  const ALLOWED_PLACEMENTS = new Set(["between_matches"]);
  
  // Events you will realistically track for interstitials.
  const ALLOWED_EVENTS = new Set([
    "requested",
    "shown",
    "dismissed",
    "clicked",
    "failed",
  ]);
  
  const ALLOWED_AD_TYPES = new Set(["interstitial"]);
  
  export async function getMyAdsConfig(req, res) {
    const userId = getAuthedUserId(req);
  
    if (!userId) {
      const err = new Error("UNAUTHORIZED");
      err.status = 401;
      err.code = "UNAUTHORIZED";
      throw err;
    }
  
    // Optionally allow querying eligibility for a placement (defaults to between_matches)
    const placement =
      req?.query?.placement?.toString() || "between_matches";
  
    if (!ALLOWED_PLACEMENTS.has(placement)) {
      const err = new Error("Invalid placement");
      err.status = 400;
      err.code = "BAD_REQUEST";
      throw err;
    }
  
    const config = await getAdsConfigForUser(userId);
    const eligibility = await getInterstitialEligibility({
      userId,
      placement,
    });
  
    return res.ok({
      userId: userId.toString(),
      config,
      eligibility,
    });
  }
  
  export async function postAdEvent(req, res) {
    const userId = getAuthedUserId(req);
  
    if (!userId) {
      const err = new Error("UNAUTHORIZED");
      err.status = 401;
      err.code = "UNAUTHORIZED";
      throw err;
    }
  
    const placement = req?.body?.placement?.toString() || "between_matches";
    const adType = req?.body?.adType?.toString() || "interstitial";
    const event = req?.body?.event?.toString();
  
    if (!ALLOWED_PLACEMENTS.has(placement)) {
      const err = new Error("Invalid placement");
      err.status = 400;
      err.code = "BAD_REQUEST";
      throw err;
    }
  
    if (!ALLOWED_AD_TYPES.has(adType)) {
      const err = new Error("Invalid adType");
      err.status = 400;
      err.code = "BAD_REQUEST";
      throw err;
    }
  
    if (!event) {
      const err = new Error("Missing event");
      err.status = 400;
      err.code = "BAD_REQUEST";
      throw err;
    }
  
    if (!ALLOWED_EVENTS.has(event)) {
      const err = new Error("Invalid event");
      err.status = 400;
      err.code = "BAD_REQUEST";
      throw err;
    }
  
    const provider = req?.body?.provider?.toString() || "unknown";
  
    // Avoid storing huge garbage objects (good hygiene)
    const rawMeta = req?.body?.meta ?? {};
    const meta =
      rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
        ? rawMeta
        : {};
  
    const doc = await logAdEvent({
      userId,
      placement,
      adType,
      event,
      provider,
      meta,
    });
  
    return res.ok({
      ok: true,
      id: doc._id.toString(),
    });
  }
  