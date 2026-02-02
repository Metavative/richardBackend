import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { applyMyCosmetics, getMyCosmetics, listCosmetics } from "./cosmetics.service.js";

const router = express.Router();

// GET /api/cosmetics
router.get("/", async (_req, res, next) => {
  try {
    const items = await listCosmetics();
    return res.ok({ items });
  } catch (e) {
    next(e);
  }
});

// GET /api/cosmetics/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const data = await getMyCosmetics(req.userId);
    return res.ok(data);
  } catch (e) {
    next(e);
  }
});

// POST /api/cosmetics/me/apply
router.post("/me/apply", requireAuth, async (req, res, next) => {
  try {
    const { boardId = "", piecesId = "" } = req.body || {};
    const applied = await applyMyCosmetics(req.userId, { boardId, piecesId });
    return res.ok({ applied });
  } catch (e) {
    next(e);
  }
});

export default router;
