import express from "express";
import FriendRequest from "../models/FriendRequest.js";

const router = express.Router();

// SEND REQUEST
router.post("/request", async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ message: "from and to are required" });
    }

    const exists = await FriendRequest.findOne({ from, to });
    if (exists) return res.status(400).json({ message: "Already sent" });

    const reqObj = await FriendRequest.create({ from, to });

    res.status(201).json(reqObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ACCEPT REQUEST
router.patch("/accept/:id", async (req, res) => {
  try {
    const reqObj = await FriendRequest.findById(req.params.id);
    if (!reqObj) return res.status(404).json({ message: "Request not found" });

    reqObj.status = "accepted";
    await reqObj.save();

    res.json(reqObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// REJECT REQUEST
router.patch("/reject/:id", async (req, res) => {
  try {
    const reqObj = await FriendRequest.findById(req.params.id);
    if (!reqObj) return res.status(404).json({ message: "Request not found" });

    reqObj.status = "rejected";
    await reqObj.save();

    res.json(reqObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ALL
router.get("/all", async (req, res) => {
  try {
    const list = await FriendRequest.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
