import express from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  heartbeat,
  registerDevice,
  unregisterDevice,
} from "./notifications.controller.js";

const router = express.Router();

router.use(requireAuth);

router.post("/device/register", asyncHandler(registerDevice));
router.post("/device/unregister", asyncHandler(unregisterDevice));
router.post("/heartbeat", asyncHandler(heartbeat));

export default router;
