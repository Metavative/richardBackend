import express from "express";
import { getMyEconomy, claimMyCoins, buyCoins, captureOrder } from "./economy.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = express.Router();

// Get user balance and stats
router.get("/me", requireAuth, getMyEconomy);

// ✅ Claim coins (XP thresholds)
router.post("/claim", requireAuth, claimMyCoins);

// ✅ NEW: Create PayPal Order
router.post("/buy-coins", requireAuth, buyCoins);

// ✅ NEW: Capture PayPal Order (This was causing your error)
// Changed from 'economyController.captureOrder' to 'captureOrder'
router.post("/buy-coins/capture", requireAuth, captureOrder);

// ✅ Aliases (optional but recommended for client fallbacks)
router.post("/buy", requireAuth, requireAuth, buyCoins);
router.post("/coins/buy", requireAuth, buyCoins);

export default router;