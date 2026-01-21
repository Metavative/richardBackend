// src/routes/challengeRoutes.js
import express from "express";
import mongoose from "mongoose";
import createError from "http-errors";

import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import Challenge from "../models/Challenge.js";

const router = express.Router();

// ✅ All challenge REST endpoints require auth
router.use(requireAuth);

/**
 * POST /api/challenges/create
 * Body: { toUserId }
 * - fromUserId is always req.userId (prevents spoofing)
 */
router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const fromUserId = req.userId;
    const toUserId = req.body?.toUserId?.toString?.().trim();

    if (!toUserId) throw createError(400, "toUserId is required");
    if (!mongoose.Types.ObjectId.isValid(fromUserId) || !mongoose.Types.ObjectId.isValid(toUserId)) {
      throw createError(400, "Invalid user id(s)");
    }
    if (fromUserId === toUserId) throw createError(400, "Cannot challenge yourself");

    // Prevent duplicate pending challenges (either direction)
    const existing = await Challenge.findOne({
      $or: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId },
      ],
      status: "pending",
    });

    if (existing) {
      const err = createError(409, "A pending challenge already exists between these users");
      err.code = "CHALLENGE_ALREADY_PENDING";
      throw err;
    }

    const challenge = await Challenge.create({
      fromUserId,
      toUserId,
      status: "pending",
    });

    return res.created({ challenge });
  })
);

/**
 * PATCH /api/challenges/:id/accept
 * Only receiver (toUserId) may accept
 */
router.patch(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) throw createError(400, "Invalid challenge id");

    const challenge = await Challenge.findById(id);
    if (!challenge) throw createError(404, "Challenge not found");

    if (challenge.toUserId.toString() !== req.userId) {
      throw createError(403, "Forbidden");
    }

    if (challenge.status !== "pending") {
      const err = createError(400, "Challenge is not pending");
      err.code = "CHALLENGE_NOT_PENDING";
      throw err;
    }

    challenge.status = "accepted";
    await challenge.save();

    return res.ok({ challenge });
  })
);

/**
 * PATCH /api/challenges/:id/reject
 * Only receiver (toUserId) may reject
 */
router.patch(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) throw createError(400, "Invalid challenge id");

    const challenge = await Challenge.findById(id);
    if (!challenge) throw createError(404, "Challenge not found");

    if (challenge.toUserId.toString() !== req.userId) {
      throw createError(403, "Forbidden");
    }

    if (challenge.status !== "pending") {
      const err = createError(400, "Challenge is not pending");
      err.code = "CHALLENGE_NOT_PENDING";
      throw err;
    }

    challenge.status = "rejected";
    await challenge.save();

    return res.ok({ challenge });
  })
);

/**
 * GET /api/challenges/mine
 * Returns challenges where I'm sender or receiver
 */
router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const myId = req.userId;

    const list = await Challenge.find({
      $or: [{ fromUserId: myId }, { toUserId: myId }],
    })
      .populate("fromUserId", "username name profilePic")
      .populate("toUserId", "username name profilePic")
      .sort({ createdAt: -1 });

    return res.ok({ challenges: list });
  })
);

export default router;
