import express from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { getMyEntitlements, unlockAdFree } from "./entitlements.controller.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyEntitlements);
router.post("/ad-free", authMiddleware, unlockAdFree);

export default router;
