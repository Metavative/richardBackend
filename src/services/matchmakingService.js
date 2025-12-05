import MatchmakingQueue from "../models/MatchmakingQueue.js";
import Match from "../models/Match.js";
import User from "../models/User.js";

class MatchmakingService {
  constructor(io) {
    this.io = io;
    this.matchmakingInterval = null;
    this.activeMatches = new Map();
    this.startMatchmakingLoop();
    console.log("✅ Matchmaking Service Started");
  }

  startMatchmakingLoop() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }
    
    this.matchmakingInterval = setInterval(async () => {
      try {
        await this.findAndCreateMatches();
        await this.cleanupExpiredMatches();
      } catch (error) {
        console.error("Matchmaking loop error:", error);
      }
    }, 3000);
  }

  async joinQueue(userData, socketId) {
    try {
      const { userId, gameMode = "1v1", region = "na" } = userData;
      
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");
      if (user.isInQueue) throw new Error("Already in queue");
      if (user.isInMatch) throw new Error("Already in a match");

      await MatchmakingQueue.deleteMany({ userId });

      // Initialize gamingStats if not exists
      if (!user.gamingStats) {
        user.gamingStats = {
          mmr: 1000,
          wins: 0,
          losses: 0,
          draws: 0,
          totalGames: 0,
          winRate: 0
        };
        await user.save();
      }

      const queueEntry = await MatchmakingQueue.create({
        userId,
        mmr: user.gamingStats.mmr || 1000,
        gameMode,
        region,
        socketId,
        status: "waiting"
      });

      user.isInQueue = true;
      user.socketId = socketId;
      await user.save();

      // Only send socket event if socketId is valid (not test ID)
      if (socketId && !socketId.startsWith("test_socket_")) {
        this.io.to(socketId).emit("matchmaking:status", {
          status: "searching",
          message: "Looking for opponents...",
          queueTime: Date.now(),
          gameMode,
          region
        });
      }

      console.log(`🎮 Player ${user.name} joined ${gameMode} queue in ${region}`);

      return {
        success: true,
        message: "Joined matchmaking queue",
        data: {
          queueId: queueEntry._id,
          gameMode,
          region,
          mmr: user.gamingStats.mmr
        }
      };
    } catch (error) {
      console.error("Error joining queue:", error);
      throw error;
    }
  }

  async leaveQueue(userId) {
    try {
      const queueEntry = await MatchmakingQueue.findOne({ userId });
      
      if (!queueEntry) {
        return { success: false, message: "Not in queue" };
      }

      await MatchmakingQueue.findByIdAndDelete(queueEntry._id);
      
      await User.findByIdAndUpdate(userId, {
        isInQueue: false,
        $unset: { socketId: 1 }
      });

      console.log(`👋 Player ${userId} left queue`);

      return { success: true, message: "Left queue successfully" };
    } catch (error) {
      console.error("Error leaving queue:", error);
      throw error;
    }
  }

  async findAndCreateMatches() {
    try {
      const waitingPlayers = await MatchmakingQueue.find({ status: "waiting" })
        .sort({ joinedAt: 1 })
        .populate("userId", "name username")
        .limit(100);

      if (waitingPlayers.length < 2) return;

      const playersByModeRegion = {};
      
      waitingPlayers.forEach(player => {
        const key = `${player.gameMode}_${player.region}`;
        if (!playersByModeRegion[key]) playersByModeRegion[key] = [];
        playersByModeRegion[key].push(player);
      });

      for (const [key, players] of Object.entries(playersByModeRegion)) {
        const [gameMode, region] = key.split("_");
        players.sort((a, b) => a.mmr - b.mmr);

        if (gameMode === "1v1") {
          await this.create1v1Matches(players, gameMode, region);
        }
        // Add other game modes as needed
      }
    } catch (error) {
      console.error("Error in findAndCreateMatches:", error);
    }
  }

  async create1v1Matches(players, gameMode, region) {
    for (let i = 0; i < players.length - 1; i++) {
      const player1 = players[i];
      
      for (let j = i + 1; j < players.length; j++) {
        const player2 = players[j];
        
        const mmrDiff = Math.abs(player1.mmr - player2.mmr);
        if (mmrDiff <= 200) { // Increased tolerance for testing
          const match = await this.createMatch([player1, player2], gameMode, region);
          
          await MatchmakingQueue.deleteMany({
            _id: { $in: [player1._id, player2._id] }
          });
          
          await Promise.all([
            User.findByIdAndUpdate(player1.userId._id, {
              isInQueue: false,
              isInMatch: true,
              currentMatchId: match.matchId,
              socketId: player1.socketId
            }),
            User.findByIdAndUpdate(player2.userId._id, {
              isInQueue: false,
              isInMatch: true,
              currentMatchId: match.matchId,
              socketId: player2.socketId
            })
          ]);

          this.activeMatches.set(match.matchId, { match, createdAt: Date.now() });
          this.notifyMatchFound(player1, player2, match);
          break;
        }
      }
    }
  }

  async createMatch(players, gameMode, region, teams = null) {
    const matchData = {
      gameMode,
      region,
      players: players.map((player, index) => ({
        userId: player.userId._id,
        username: player.userId.name,
        mmr: player.mmr,
        team: teams ? 
          (teams.teamA.includes(player.userId._id) ? "red" : "blue") :
          (index % 2 === 0 ? "red" : "blue"),
        score: 0,
        ready: false,
        connected: true
      })),
      settings: {
        maxPlayers: 2,
        duration: 600,
        isRanked: true,
        allowSpectators: false
      },
      status: "pending"
    };

    const match = await Match.create(matchData);
    console.log(`🎯 Match created: ${match.matchId} (${players.length} players)`);
    
    return match;
  }

  notifyMatchFound(player1, player2, match) {
    const matchData = {
      matchId: match.matchId,
      gameMode: match.gameMode,
      region: match.region,
      players: match.players.map(p => ({
        userId: p.userId,
        username: p.username,
        mmr: p.mmr,
        team: p.team
      })),
      createdAt: match.createdAt
    };

    // Only send socket notifications for real socket IDs
    if (player1.socketId && !player1.socketId.startsWith("test_socket_")) {
      this.io.to(player1.socketId).emit("matchmaking:found", {
        status: "found",
        message: "Match found!",
        match: matchData
      });
    }

    if (player2.socketId && !player2.socketId.startsWith("test_socket_")) {
      this.io.to(player2.socketId).emit("matchmaking:found", {
        status: "found",
        message: "Match found!",
        match: matchData
      });
    }

    console.log(`🔔 Match found: ${match.matchId} (${player1.userId.name} vs ${player2.userId.name})`);
  }

  async cleanupExpiredMatches() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const expiredMatches = await Match.find({
        status: { $in: ["pending", "starting"] },
        createdAt: { $lt: oneHourAgo }
      });

      for (const match of expiredMatches) {
        match.status = "cancelled";
        await match.save();

        await User.updateMany(
          { _id: { $in: match.players.map(p => p.userId) } },
          {
            isInMatch: false,
            $unset: { currentMatchId: 1 }
          }
        );

        this.activeMatches.delete(match.matchId);
        console.log(`🧹 Cleared expired match: ${match.matchId}`);
      }
    } catch (error) {
      console.error("Error cleaning up expired matches:", error);
    }
  }
}

export default MatchmakingService;