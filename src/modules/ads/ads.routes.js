import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { getMyAdsConfig, postAdEvent } from "./ads.controller.js";

const router = express.Router();

router.get("/config", requireAuth, getMyAdsConfig);
router.post("/event", requireAuth, postAdEvent);

export default router;
