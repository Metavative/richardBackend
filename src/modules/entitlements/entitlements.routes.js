import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  getMyEntitlements,
  buyAdFree,
  buyPremiumAi,
} from "./entitlements.controller.js";

const router = express.Router();

// Read
router.get("/me", requireAuth, getMyEntitlements);

// Purchases (coins-based, dev placeholder)
router.post("/ad-free", requireAuth, buyAdFree);

// ✅ Premium AI canonical
router.post("/premium-ai", requireAuth, buyPremiumAi);

// ✅ Aliases for client fallbacks
router.post("/premiumAI", requireAuth, buyPremiumAi);
router.post("/premium", requireAuth, buyPremiumAi);

export default router;
