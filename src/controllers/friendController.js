import FriendRequest from "../models/FriendRequest.js";

export const sendRequest = async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to)
      return res.status(400).json({ message: "from and to required" });

    const existing = await FriendRequest.findOne({ from, to });
    if (existing)
      return res.status(400).json({ message: "already sent" });

    const reqDoc = await FriendRequest.create({ from, to });
    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const respond = async (req, res) => {
  try {
    const { requestId, action } = req.body;

    const reqDoc = await FriendRequest.findById(requestId);
    if (!reqDoc)
      return res.status(404).json({ message: "Request not found" });

    if (action === "accept") reqDoc.status = "accepted";
    else if (action === "reject") reqDoc.status = "rejected";
    else return res.status(400).json({ message: "Invalid action" });

    await reqDoc.save();
    res.json(reqDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 