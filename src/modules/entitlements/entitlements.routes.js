import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { getMyEntitlements, unlockAdFree } from "./entitlements.controller.js";

const router = express.Router();

router.get("/me", requireAuth, getMyEntitlements);
router.post("/ad-free", requireAuth, unlockAdFree);

export default router;
