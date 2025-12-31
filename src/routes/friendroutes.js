import express from "express";
import mongoose from "mongoose";
import FriendRequest from "../models/FriendRequest.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// If you want friends to be protected (recommended)
router.use(requireAuth);

// TEST
router.get("/test", (_req, res) =>
  res.json({ message: "Friend routes working!" })
);

// SEND REQUEST
// POST /api/friends/send  { from, to }
// (We will ignore "from" from client and use req.userId to prevent spoofing)
router.post("/send", async (req, res) => {
  try {
    const from = req.userId; // ✅ secure source
    const { to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ message: "from and to required" });
    }

    if (!mongoose.Types.ObjectId.isValid(from) || !mongoose.Types.ObjectId.isValid(to)) {
      return res.status(400).json({ message: "invalid user id(s)" });
    }

    if (from === to) {
      return res.status(400).json({ message: "cannot friend yourself" });
    }

    // Block duplicates in BOTH directions for pending/accepted
    const existing = await FriendRequest.findOne({
      $or: [
        { from, to },
        { from: to, to: from },
      ],
      status: { $in: ["pending", "accepted"] },
    });

    if (existing) {
      return res.status(400).json({
        message: "request already exists or you're already friends",
      });
    }

    const reqDoc = await FriendRequest.create({
      from,
      to,
      status: "pending",
    });

    res.status(201).json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ACCEPT REQUEST
// PATCH /api/friends/accept/:id
router.patch("/accept/:id", async (req, res) => {
  try {
    const reqDoc = await FriendRequest.findById(req.params.id);
    if (!reqDoc) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Optional safety: only receiver can accept
    if (reqDoc.to.toString() !== req.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    reqDoc.status = "accepted";
    await reqDoc.save();

    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// REJECT REQUEST
// PATCH /api/friends/reject/:id
router.patch("/reject/:id", async (req, res) => {
  try {
    const reqDoc = await FriendRequest.findById(req.params.id);
    if (!reqDoc) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Optional safety: only receiver can reject
    if (reqDoc.to.toString() !== req.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    reqDoc.status = "rejected";
    await reqDoc.save();

    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET MY REQUESTS (PRODUCTION)
// GET /api/friends/mine/:userId
router.get("/mine/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // ✅ enforce user can only fetch their own data
    if (userId !== req.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "invalid user id" });
    }

    const list = await FriendRequest.find({
      $or: [{ from: userId }, { to: userId }],
    })
      .populate("from", "username name")
      .populate("to", "username name")
      .sort({ createdAt: -1 });

    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL REQUESTS (ADMIN/DEBUG)
// GET /api/friends/all
router.get("/all", async (_req, res) => {
  try {
    const list = await FriendRequest.find()
      .populate("from", "username name")
      .populate("to", "username name")
      .sort({ createdAt: -1 });

    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
