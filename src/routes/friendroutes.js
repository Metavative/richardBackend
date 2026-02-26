// src/routes/friendroutes.js
import express from "express";
import mongoose from "mongoose";
import createError from "http-errors";

import FriendRequest from "../models/FriendRequest.js";
import User from "../models/User.js"; // ✅ NEW (to enrich socket payloads)
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getIO } from "../sockets/realtime.js";

const router = express.Router();
router.use(requireAuth);

// ------------------------------
// helpers
// ------------------------------
function isObjectId(v) {
  return mongoose.Types.ObjectId.isValid(String(v || "").trim());
}
function toId(v) {
  return String(v || "").trim();
}

function computeDisplayName(u) {
  const nickname = String(u?.nickname || "").trim();
  const username = String(u?.username || "").trim();
  const name = String(u?.name || "").trim();
  return nickname || username || name || "Player";
}

function normUserPic(u) {
  if (!u) return u;

  const pic =
    u.profilePic ||
    u.avatar ||
    u.photoUrl ||
    u.imageUrl ||
    u.profile_picture?.url ||
    (u.profile &&
      (u.profile.profilePic ||
        u.profile.avatar ||
        u.profile.photoUrl ||
        u.profile.imageUrl)) ||
    null;

  return {
    ...u,
    profilePic: pic,
    displayName: computeDisplayName(u),
  };
}

function normalizeFriendRequestRow(r) {
  if (!r) return r;
  return {
    ...r,
    from: normUserPic(r.from),
    to: normUserPic(r.to),
  };
}

function emitToUser(userId, event, payload) {
  const io = getIO();
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

// fields we want from User to build instant UI payloads
const USER_MINI_SELECT = "_id name nickname username profile_picture isOnline";

// populate fields for REST responses
const POP_FIELDS =
  "username name nickname profile_picture profilePic avatar photoUrl imageUrl profile";

// build a mini user object for sockets
async function getUserMini(userId) {
  if (!userId || !isObjectId(userId)) return null;
  const u = await User.findById(userId).select(USER_MINI_SELECT).lean();
  if (!u) return null;

  const profilePic = u.profile_picture?.url || null;

  return {
    id: u._id?.toString(),
    username: u.username ?? null,
    name: u.name ?? "",
    nickname: u.nickname ?? "",
    displayName: computeDisplayName(u),
    profilePic,
    isOnline: u.isOnline ?? false,
  };
}

// ------------------------------
// TEST
// ------------------------------
router.get(
  "/test",
  asyncHandler(async (_req, res) => {
    return res.status(200).json({ message: "Friend routes working!" });
  })
);

// ------------------------------
// FRIEND STATUS
// ------------------------------
router.get(
  "/status/:userId",
  asyncHandler(async (req, res) => {
    const me = req.userId;
    const other = toId(req.params.userId);

    if (!isObjectId(other)) throw createError(400, "Invalid user id");
    if (me === other) return res.status(200).json({ status: "self" });

    const doc = await FriendRequest.findOne({
      $or: [{ from: me, to: other }, { from: other, to: me }],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!doc) return res.status(200).json({ status: "none" });

    const status = String(doc.status || "pending").toLowerCase();
    const incoming = String(doc.to) === String(me);

    if (status === "accepted")
      return res.status(200).json({ status: "friends", requestId: doc._id });

    if (status === "rejected")
      return res.status(200).json({ status: "rejected", requestId: doc._id });

    return res.status(200).json({
      status: incoming ? "pendingIncoming" : "pendingOutgoing",
      requestId: doc._id,
    });
  })
);

// ------------------------------
// SEND REQUEST
// ------------------------------
router.post(
  "/send",
  asyncHandler(async (req, res) => {
    const from = req.userId;
    const to = toId(req.body?.to);

    if (!to) throw createError(400, "to is required");
    if (!isObjectId(from) || !isObjectId(to))
      throw createError(400, "Invalid user id(s)");
    if (from === to) throw createError(400, "Cannot friend yourself");

    const existing = await FriendRequest.findOne({
      $or: [{ from, to }, { from: to, to: from }],
      status: { $in: ["pending", "accepted"] },
    });

    if (existing) {
      const err = createError(
        409,
        "Request already exists or you are already friends"
      );
      err.code = "FRIEND_REQUEST_EXISTS";
      throw err;
    }

    const doc = await FriendRequest.create({ from, to, status: "pending" });

    // ✅ enrich socket payload
    const fromUser = await getUserMini(from);

    emitToUser(to, "friends:request", {
      requestId: doc._id.toString(),
      status: "pending",
      from,
      to,
      fromUser, // ✅ displayName/profilePic ready for UI
    });

    return res.status(201).json({ request: doc });
  })
);

// ------------------------------
// ACCEPT REQUEST
// ------------------------------
router.patch(
  "/accept/:id",
  asyncHandler(async (req, res) => {
    const requestId = toId(req.params.id);
    if (!isObjectId(requestId)) throw createError(400, "Invalid request id");

    const doc = await FriendRequest.findById(requestId);
    if (!doc) throw createError(404, "Request not found");

    if (doc.to.toString() !== req.userId) throw createError(403, "Forbidden");

    if (doc.status !== "pending") {
      const err = createError(400, "Request is not pending");
      err.code = "FRIEND_REQUEST_NOT_PENDING";
      throw err;
    }

    doc.status = "accepted";
    await doc.save();

    const fromId = doc.from.toString();
    const toIdStr = doc.to.toString();

    const fromUser = await getUserMini(fromId);
    const toUser = await getUserMini(toIdStr);

    // ✅ notify sender
    emitToUser(fromId, "friends:accepted", {
      requestId: doc._id.toString(),
      status: "accepted",
      from: fromId,
      to: toIdStr,
      fromUser,
      toUser,
    });

    // ✅ optionally notify receiver too (handy if they have multiple screens open)
    emitToUser(toIdStr, "friends:accepted", {
      requestId: doc._id.toString(),
      status: "accepted",
      from: fromId,
      to: toIdStr,
      fromUser,
      toUser,
    });

    return res.status(200).json({ request: doc });
  })
);

// ------------------------------
// REJECT REQUEST
// ------------------------------
router.patch(
  "/reject/:id",
  asyncHandler(async (req, res) => {
    const requestId = toId(req.params.id);
    if (!isObjectId(requestId)) throw createError(400, "Invalid request id");

    const doc = await FriendRequest.findById(requestId);
    if (!doc) throw createError(404, "Request not found");

    if (doc.to.toString() !== req.userId) throw createError(403, "Forbidden");

    if (doc.status !== "pending") {
      const err = createError(400, "Request is not pending");
      err.code = "FRIEND_REQUEST_NOT_PENDING";
      throw err;
    }

    doc.status = "rejected";
    await doc.save();

    const fromId = doc.from.toString();
    const toIdStr = doc.to.toString();

    const fromUser = await getUserMini(fromId);
    const toUser = await getUserMini(toIdStr);

    // ✅ notify sender
    emitToUser(fromId, "friends:rejected", {
      requestId: doc._id.toString(),
      status: "rejected",
      from: fromId,
      to: toIdStr,
      fromUser,
      toUser,
    });

    // ✅ optionally notify receiver too
    emitToUser(toIdStr, "friends:rejected", {
      requestId: doc._id.toString(),
      status: "rejected",
      from: fromId,
      to: toIdStr,
      fromUser,
      toUser,
    });

    return res.status(200).json({ request: doc });
  })
);

// ------------------------------
// CANCEL OUTGOING REQUEST
// ------------------------------
router.patch(
  "/cancel/:id",
  asyncHandler(async (req, res) => {
    const requestId = toId(req.params.id);
    if (!isObjectId(requestId)) throw createError(400, "Invalid request id");

    const doc = await FriendRequest.findById(requestId);
    if (!doc) throw createError(404, "Request not found");

    if (doc.from.toString() !== req.userId) throw createError(403, "Forbidden");

    if (doc.status !== "pending") {
      const err = createError(400, "Only pending requests can be cancelled");
      err.code = "FRIEND_REQUEST_NOT_PENDING";
      throw err;
    }

    const fromId = doc.from.toString();
    const toIdStr = doc.to.toString();

    await doc.deleteOne();

    const fromUser = await getUserMini(fromId);

    emitToUser(toIdStr, "friends:cancelled", {
      requestId,
      status: "cancelled",
      from: fromId,
      to: toIdStr,
      fromUser,
    });

    return res.status(200).json({ message: "Request cancelled" });
  })
);

// ------------------------------
// GET MY REQUESTS
// ------------------------------
router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const userId = req.userId;

    const list = await FriendRequest.find({
      $or: [{ from: userId }, { to: userId }],
    })
      .populate("from", POP_FIELDS)
      .populate("to", POP_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    const normalized = (list || []).map(normalizeFriendRequestRow);

    return res.status(200).json({ requests: normalized });
  })
);

// ------------------------------
// GET FRIENDS LIST
// ------------------------------
router.get(
  "/list",
  asyncHandler(async (req, res) => {
    const userId = req.userId;

    const list = await FriendRequest.find({
      status: "accepted",
      $or: [{ from: userId }, { to: userId }],
    })
      .populate("from", POP_FIELDS)
      .populate("to", POP_FIELDS)
      .sort({ updatedAt: -1 })
      .lean();

    const friends = (list || []).map((r) => {
      const other = String(r.from?._id) === String(userId) ? r.to : r.from;
      return normUserPic(other);
    });

    return res.status(200).json({ friends });
  })
);

// ------------------------------
// UNFRIEND
// ------------------------------
router.delete(
  "/unfriend/:userId",
  asyncHandler(async (req, res) => {
    const me = req.userId;
    const other = toId(req.params.userId);

    if (!isObjectId(other)) throw createError(400, "Invalid user id");
    if (me === other) throw createError(400, "Invalid target");

    const doc = await FriendRequest.findOneAndDelete({
      status: "accepted",
      $or: [{ from: me, to: other }, { from: other, to: me }],
    });

    if (!doc) return res.status(404).json({ message: "Friendship not found" });

    const meUser = await getUserMini(me);
    const otherUser = await getUserMini(other);

    // ✅ emit to both (include mini user objects so UI updates instantly)
    emitToUser(me, "friends:unfriended", { userId: other, otherUser });
    emitToUser(other, "friends:unfriended", { userId: me, otherUser: meUser });

    return res.status(200).json({ message: "Unfriended" });
  })
);

// ------------------------------
// ADMIN: GET ALL REQUESTS
// ------------------------------
router.get(
  "/all",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const list = await FriendRequest.find()
      .populate("from", POP_FIELDS)
      .populate("to", POP_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    const normalized = (list || []).map(normalizeFriendRequestRow);

    return res.status(200).json({ requests: normalized });
  })
);

export default router;