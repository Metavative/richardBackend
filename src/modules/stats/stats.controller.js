// src/modules/stats/stats.controller.js
import { getMyStats } from "./stats.service.js";

export async function getMyStatsController(req, res) {
  try {
    // Support multiple auth middleware shapes
    const userId =
      req?.user?.sub ||
      req?.user?.userId ||
      req?.userId ||
      req?.user?.id;

    if (!userId) {
      return res
        .status(401)
        .json({ code: "UNAUTHORIZED", message: "Missing user" });
    }

    const data = await getMyStats(userId);
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: e?.message || "Failed to load stats",
    });
  }
}
