// src/modules/history/history.controller.js
import { getMyHistory } from "./history.service.js";

export async function getMyHistoryController(req, res) {
  try {
    const userId =
      req?.user?.sub ||
      req?.user?.userId ||
      req?.userId ||
      req?.user?.id;

    if (!userId) {
      return res.status(401).json({ code: "UNAUTHORIZED", message: "Missing user" });
    }

    const limit = Math.min(Number(req.query.limit || 25) || 25, 100);
    const data = await getMyHistory(userId, { limit });

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: e?.message || "Failed to load game history",
    });
  }
}
