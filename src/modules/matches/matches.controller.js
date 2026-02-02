// src/modules/matches/matches.controller.js
import { listMyMatchHistory } from "./matches.service.js";

function getUserId(req) {
  return req?.user?.sub || req?.user?.userId || req?.userId || null;
}

export async function getMyMatchHistory(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const limit = req.query?.limit;
    const items = await listMyMatchHistory(userId, { limit });

    return res.json({ data: items });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Failed to load match history" });
  }
}
