// src/modules/economy/economy.routes.js
import express from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";

import {
  getMyEconomy,
  claimMyCoins,
  buyCoins,
  captureOrder,
} from "./economy.controller.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyEconomy);
router.post("/claim", authMiddleware, claimMyCoins);

// PayPal
router.post("/buy-coins", authMiddleware, buyCoins);
router.post("/capture-order", authMiddleware, captureOrder);

export default router;
