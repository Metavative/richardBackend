import { Router } from "express";
import mongoose from "mongoose";
import Challenge from "../models/Challenge.js";
// If you want auth on challenges too, uncomment:
// import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// If you want this secured, enable auth:
// router.use(requireAuth);

// Health/test
router.get("/test", (_req, res) => {
  res.json({ message: "Challenge routes working!" });
});

// POST /api/challenges/create  { from, to }
router.post("/create", async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ message: "from and to required" });
    }

    if (
      !mongoose.Types.ObjectId.isValid(from) ||
      !mongoose.Types.ObjectId.isValid(to)
    ) {
      return res.status(400).json({ message: "invalid user id(s)" });
    }

    if (from === to) {
      return res.status(400).json({ message: "cannot challenge yourself" });
    }

    const doc = await Challenge.create({
      from,
      to,
      status: "pending",
    });

    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
