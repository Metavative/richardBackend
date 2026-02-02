// src/modules/history/history.routes.js
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMyHistoryController } from "./history.controller.js";

const router = express.Router();

router.get("/me", requireAuth, getMyHistoryController);

export default router;
