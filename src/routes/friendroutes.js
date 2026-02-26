// src/routes/friendroutes.js
import express from "express";
import mongoose from "mongoose";
import createError from "http-errors";

import FriendRequest from "../models/FriendRequest.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// ✅ Auth required for all friend endpoints
router.use(requireAuth);

// ------------------------------
// helpers
// ------------------------------
function normUserPic(u) {
  if (!u) return u;

  // Support various common fields + nested profile fields
  const pic =
    u.profilePic ||
    u.avatar ||
    u.photoUrl ||
    u.imageUrl ||
    (u.profile && (u.profile.profilePic || u.profile.avatar || u.profile.photoUrl || u.profile.imageUrl)) ||
    null;

  // Ensure top-level profilePic always exists (or null)
  return { ...u, profilePic: pic };
}

function normalizeFriendRequestRow(r) {
  if (!r) return r;
  return {
    ...r,
    from: normUserPic(r.from),
    to: normUserPic(r.to),
  };
}

// TEST
router.get(
  "/test",
  asyncHandler(async (req, res) => {
    return res.ok({ message: "Friend routes working!" });
  })
);

// SEND REQUEST
// POST /api/friends/send  { to }
// NOTE: we ignore "from" from client and use req.userId to prevent spoofing
router.post(
  "/send",
  asyncHandler(async (req, res) => {
    const from = req.userId;
    const to = req.body?.to?.toString?.().trim();

    if (!to) throw createError(400, "to is required");
    if (!mongoose.Types.ObjectId.isValid(from) || !mongoose.Types.ObjectId.isValid(to)) {
      throw createError(400, "Invalid user id(s)");
    }
    if (from === to) throw createError(400, "Cannot friend yourself");

    // Block duplicates in BOTH directions for pending/accepted
    const existing = await FriendRequest.findOne({
      $or: [{ from, to }, { from: to, to: from }],
      status: { $in: ["pending", "accepted"] },
    });

    if (existing) {
      const err = createError(409, "Request already exists or you are already friends");
      err.code = "FRIEND_REQUEST_EXISTS";
      throw err;
    }

    const doc = await FriendRequest.create({ from, to, status: "pending" });

    return res.created({ request: doc });
  })
);

// ACCEPT REQUEST
// PATCH /api/friends/accept/:id
router.patch(
  "/accept/:id",
  asyncHandler(async (req, res) => {
    const requestId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      throw createError(400, "Invalid request id");
    }

    const doc = await FriendRequest.findById(requestId);
    if (!doc) throw createError(404, "Request not found");

    // ✅ only receiver can accept
    if (doc.to.toString() !== req.userId) {
      throw createError(403, "Forbidden");
    }

    if (doc.status !== "pending") {
      const err = createError(400, "Request is not pending");
      err.code = "FRIEND_REQUEST_NOT_PENDING";
      throw err;
    }

    doc.status = "accepted";
    await doc.save();

    return res.ok({ request: doc });
  })
);

// REJECT REQUEST
// PATCH /api/friends/reject/:id
router.patch(
  "/reject/:id",
  asyncHandler(async (req, res) => {
    const requestId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      throw createError(400, "Invalid request id");
    }

    const doc = await FriendRequest.findById(requestId);
    if (!doc) throw createError(404, "Request not found");

    // ✅ only receiver can reject
    if (doc.to.toString() !== req.userId) {
      throw createError(403, "Forbidden");
    }

    if (doc.status !== "pending") {
      const err = createError(400, "Request is not pending");
      err.code = "FRIEND_REQUEST_NOT_PENDING";
      throw err;
    }

    doc.status = "rejected";
    await doc.save();

    return res.ok({ request: doc });
  })
);

// GET MY REQUESTS
// GET /api/friends/mine/:userId
router.get(
  "/mine/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // ✅ enforce user can only fetch their own data (unless admin)
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && userId !== req.userId) {
      throw createError(403, "Forbidden");
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw createError(400, "Invalid user id");
    }

    const list = await FriendRequest.find({
      $or: [{ from: userId }, { to: userId }],
    })
      // include profile so we can normalize nested pics
      .populate("from", "username name profilePic avatar photoUrl imageUrl profile")
      .populate("to", "username name profilePic avatar photoUrl imageUrl profile")
      .sort({ createdAt: -1 })
      .lean();

    const normalized = (list || []).map(normalizeFriendRequestRow);

    return res.ok({ requests: normalized });
  })
);

// GET ALL REQUESTS (ADMIN ONLY)
// GET /api/friends/all
router.get(
  "/all",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const list = await FriendRequest.find()
      .populate("from", "username name profilePic avatar photoUrl imageUrl profile")
      .populate("to", "username name profilePic avatar photoUrl imageUrl profile")
      .sort({ createdAt: -1 })
      .lean();

    const normalized = (list || []).map(normalizeFriendRequestRow);

    return res.ok({ requests: normalized });
  })
);

export default router;