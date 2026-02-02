// src/modules/matches/matches.routes.js
import express from "express";
import { getMyMatchHistory } from "./matches.controller.js";
import requireAuth from "../../middleware/requireAuth.js";

const router = express.Router();

// GET /api/matches/me?limit=50
router.get("/me", requireAuth, getMyMatchHistory);

export default router;
