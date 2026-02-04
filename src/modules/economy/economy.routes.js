// src/modules/economy/economy.routes.js
import express from "express";
import {
  getMyEconomy,
  claimMyCoins,
  buyCoins,
  captureOrder,
} from "./economy.controller.js";

import { authMiddleware } from "../../middleware/auth.middleware.js";

const router = express.Router();

// GET /api/economy/me
router.get("/me", authMiddleware, getMyEconomy);

// POST /api/economy/claim
router.post("/claim", authMiddleware, claimMyCoins);

// POST /api/economy/buy-coins
router.post("/buy-coins", authMiddleware, buyCoins);

// POST /api/economy/capture-payment
router.post("/capture-payment", authMiddleware, captureOrder);

export default router;
