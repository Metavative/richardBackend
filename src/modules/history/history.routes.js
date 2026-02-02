import express from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { getMyHistoryController } from "./history.controller.js";

const router = express.Router();

router.get("/me", authMiddleware, getMyHistoryController);

export default router;
