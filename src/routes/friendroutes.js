import express from "express";
import FriendRequest from "../models/FriendRequest.js";

const router = express.Router();

// TEST
router.get("/test", (_req, res) => res.json({ message: "Friend routes working!" }));

// SEND REQUEST
router.post("/send", async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to)
      return res.status(400).json({ message: "from and to required" });

    const existing = await FriendRequest.findOne({ from, to });
    if (existing)
      return res.status(400).json({ message: "already sent" });

    const reqDoc = await FriendRequest.create({ from, to });
    res.status(201).json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ACCEPT REQUEST
router.patch("/accept/:id", async (req, res) => {
  try {
    const reqDoc = await FriendRequest.findById(req.params.id);
    if (!reqDoc)
      return res.status(404).json({ message: "Request not found" });

    reqDoc.status = "accepted";
    await reqDoc.save();
    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// REJECT REQUEST
router.patch("/reject/:id", async (req, res) => {
  try {
    const reqDoc = await FriendRequest.findById(req.params.id);
    if (!reqDoc)
      return res.status(404).json({ message: "Request not found" });

    reqDoc.status = "rejected";
    await reqDoc.save();
    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL REQUESTS — POPULATED WITH USER NAMES
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
