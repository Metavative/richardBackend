import MatchmakingService from "../services/matchmakingService.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import createError from "http-errors";

let matchmakingService = null;

export const initializeMatchmaking = (io) => {
  console.log("📡 Initializing matchmaking...");
  matchmakingService = new MatchmakingService(io);
  return matchmakingService;
};

export const joinQueue = async (req, res, next) => {
  try {
    if (!matchmakingService) {
      throw createError(500, "Matchmaking service not initialized");
    }

    const userId = req.user?.sub;
    const body = req.body || {};

    // Safe access
    let socketId = body.socketId || req.headers["x-socket-id"];
    const gameMode = body.gameMode || "1v1";
    const region = body.region || "na";

    if (!userId) throw createError(401, "User not authenticated");

    // Generate socketId if not provided (for testing)
    if (!socketId) {
      socketId = `test_socket_${userId}_${Date.now()}`;
      console.log(`⚠️ Generated socketId for testing: ${socketId}`);
    }

    const result = await matchmakingService.joinQueue(
      {
        userId,
        gameMode,
        region,
      },
      socketId
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const leaveQueue = async (req, res, next) => {
  try {
    if (!matchmakingService) {
      throw createError(500, "Matchmaking service not initialized");
    }

    const userId = req.user?.sub;
    if (!userId) throw createError(401, "User not authenticated");

    const result = await matchmakingService.leaveQueue(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getMatchStatus = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    if (!userId) throw createError(401, "User not authenticated");

    const user = await User.findById(userId);
    if (!user) throw createError(404, "User not found");

    let matchData = null;

    if (user.isInMatch && user.currentMatchId) {
      const match = await Match.findOne({ matchId: user.currentMatchId }).populate(
        "players.userId",
        "name username"
      );

      if (match) {
        matchData = {
          matchId: match.matchId,
          status: match.status,
          gameMode: match.gameMode,
          region: match.region,
          players: match.players.map((p) => ({
            userId: p.userId._id,
            username: p.username || p.userId.name,
            mmr: p.mmr,
            team: p.team,
            score: p.score,
            ready: p.ready,
          })),
          startedAt: match.startedAt,
          createdAt: match.createdAt,
        };
      }
    }

    res.json({
      isInQueue: user.isInQueue || false,
      isInMatch: user.isInMatch || false,
      currentMatchId: user.currentMatchId || null,
      match: matchData,
      gamingStats:
        user.gamingStats || {
          mmr: 1000,
          wins: 0,
          losses: 0,
          draws: 0,
          totalGames: 0,
          winRate: 0,
        },
    });
  } catch (error) {
    next(error);
  }
};

export const getMatch = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    if (!matchId) throw createError(400, "Match ID is required");

    const match = await Match.findOne({ matchId })
      .populate("players.userId", "name username gamingStats")
      .lean();

    if (!match) throw createError(404, "Match not found");

    const formattedMatch = {
      ...match,
      players: match.players.map((p) => ({
        ...p,
        userId: p.userId._id,
        username: p.userId.username || p.userId.name,
        mmr: p.userId.gamingStats?.mmr || p.mmr || 1000,
      })),
    };

    res.json(formattedMatch);
  } catch (error) {
    next(error);
  }
};

export const setPlayerReady = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const { matchId } = req.body;

    if (!userId) throw createError(401, "User not authenticated");
    if (!matchId) throw createError(400, "Match ID is required");

    const match = await Match.findOne({ matchId });
    if (!match) throw createError(404, "Match not found");

    const playerIndex = match.players.findIndex(
      (p) => p.userId.toString() === userId.toString()
    );

    if (playerIndex === -1) throw createError(403, "Player not in this match");

    match.players[playerIndex].ready = true;
    await match.save();

    const allReady = match.players.every((p) => p.ready);

    if (allReady && match.status === "pending") {
      match.status = "starting";
      await match.save();
    }

    res.json({
      success: true,
      message: "Player ready status updated",
      allReady,
      matchStatus: match.status,
    });
  } catch (error) {
    next(error);
  }
};

export const getMatchmakingStats = async (req, res, next) => {
  try {
    if (!matchmakingService) {
      throw createError(500, "Matchmaking service not initialized");
    }

    const queueCount = await import("../models/MatchmakingQueue.js")
      .then(async ({ default: MatchmakingQueue }) => {
        return await MatchmakingQueue.countDocuments({ status: "waiting" });
      })
      .catch(() => 0);

    const activeMatchCount = await Match.countDocuments({
      status: { $in: ["pending", "starting", "in_progress"] },
    }).catch(() => 0);

    const queueDetails = await User.find(
      { isInQueue: true },
      "name username email"
    )
      .limit(20)
      .catch(() => []);

    res.json({
      queueCount,
      activeMatchCount,
      queueDetails,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelMatch = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    if (!matchId) throw createError(400, "Match ID is required");

    const match = await Match.findOne({ matchId });
    if (!match) throw createError(404, "Match not found");

    match.status = "cancelled";
    await match.save();

    await User.updateMany(
      { _id: { $in: match.players.map((p) => p.userId) } },
      {
        isInMatch: false,
        isInQueue: false,
        $unset: { currentMatchId: 1, socketId: 1 },
      }
    );

    res.json({
      success: true,
      message: "Match cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const completeMatch = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { results } = req.body;

    if (!matchId || !results) {
      throw createError(400, "Match ID and results are required");
    }

    const match = await Match.findOne({ matchId });
    if (!match) throw createError(404, "Match not found");
    if (match.status !== "in_progress") {
      throw createError(400, "Match is not in progress");
    }

    match.status = "completed";
    match.results = results;
    match.completedAt = new Date();

    if (match.startedAt) {
      match.results.duration = Math.floor(
        (match.completedAt - match.startedAt) / 1000
      );
    }

    await match.save();

    // Update players' stats
    for (const player of match.players) {
      try {
        const user = await User.findById(player.userId);
        if (!user) continue;

        if (!user.gamingStats) {
          user.gamingStats = {
            mmr: 1000,
            wins: 0,
            losses: 0,
            draws: 0,
            totalGames: 0,
            winRate: 0,
          };
        }

        if (results.winner === player.userId.toString()) {
          user.gamingStats.wins += 1;
          user.gamingStats.mmr += 25;
        } else if (results.draw) {
          user.gamingStats.draws += 1;
          user.gamingStats.mmr += 5;
        } else {
          user.gamingStats.losses += 1;
          user.gamingStats.mmr -= 15;
          if (user.gamingStats.mmr < 0) user.gamingStats.mmr = 0;
        }

        user.gamingStats.totalGames =
          user.gamingStats.wins +
          user.gamingStats.losses +
          user.gamingStats.draws;

        if (user.gamingStats.totalGames > 0) {
          user.gamingStats.winRate =
            (user.gamingStats.wins / user.gamingStats.totalGames) * 100;
        }

        user.isInMatch = false;
        user.currentMatchId = null;
        user.lastMatchAt = new Date();

        await user.save();
      } catch (err) {
        console.error("Error updating player stats:", err);
      }
    }

    res.json({
      success: true,
      message: "Match completed successfully",
      match,
    });
  } catch (error) {
    next(error);
  }
};
