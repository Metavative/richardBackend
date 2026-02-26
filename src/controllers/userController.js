// src/controllers/userController.js
import createError from "http-errors";
import mongoose from "mongoose";
import User from "../models/User.js";

function safeUserOut(u, { includeEmail = false, includeRole = false } = {}) {
  if (!u) return null;

  const profilePic = u.profile_picture?.url || null;

  const displayName =
    (u.nickname && String(u.nickname).trim()) ||
    (u.username && String(u.username).trim()) ||
    (u.name && String(u.name).trim()) ||
    "Player";

  const out = {
    id: (u._id ?? u.id)?.toString(),
    displayName,
    nickname: u.nickname || "",
    name: u.name ?? "",
    username: u.username ?? null,
    profilePic,
    bio: u.bio ?? undefined,
    isOnline: u.isOnline ?? false,
  };

  if (includeEmail) out.email = u.email;
  if (includeRole) out.role = u.role;

  return out;
}

/**
 * GET /api/users/me
 * Auth required
 */
export async function getMe(req, res) {
  const userId = req.userId;

  const user = await User.findById(userId)
    .select("_id name nickname username email role profile_picture bio isOnline")
    .lean();

  if (!user) throw createError(404, "User not found");

  return res.status(200).json({
    user: safeUserOut(user, { includeEmail: true, includeRole: true }),
  });
}

/**
 * GET /api/users/:id
 * Public-safe profile (no email)
 */
export async function getPublicProfile(req, res) {
  const id = String(req.params.id || "").trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(400, "Invalid user id");
  }

  const user = await User.findById(id)
    .select("_id name nickname username profile_picture bio isOnline gamingStats economy entitlements")
    .lean();

  if (!user) throw createError(404, "User not found");

  return res.status(200).json({
    user: {
      ...safeUserOut(user),
      gamingStats: user.gamingStats
        ? {
            mmr: user.gamingStats.mmr ?? 1000,
            wins: user.gamingStats.wins ?? 0,
            losses: user.gamingStats.losses ?? 0,
          }
        : undefined,
      economy: user.economy
        ? {
            pointsBalance: user.economy.pointsBalance ?? 0,
            coinsBalance: user.economy.coinsBalance ?? 0,
          }
        : undefined,
      entitlements: user.entitlements
        ? {
            adFree: user.entitlements.adFree === true,
            premiumAI: user.entitlements.premiumAI === true,
          }
        : undefined,
    },
  });
}

/**
 * GET /api/users/search?q=...
 * Auth required
 */
export async function searchUsers(req, res) {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(200).json({ users: [] });

  const limit = Math.min(Number(req.query.limit || 20), 50);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const list = await User.find({
    $or: [{ username: rx }, { name: rx }, { nickname: rx }],
  })
    .select("_id name nickname username profile_picture isOnline gamingStats")
    .limit(limit)
    .lean();

  const users = (list || []).map((u) => ({
    ...safeUserOut(u),
    gamingStats: u.gamingStats
      ? { mmr: u.gamingStats.mmr ?? 1000, wins: u.gamingStats.wins ?? 0 }
      : undefined,
  }));

  return res.status(200).json({ users });
}

/**
 * PUT /api/users/edit
 * Auth required
 */
export async function editProfile(req, res) {
  const userId = req.userId;

  const updates = {};
  if (req.body?.name) updates.name = String(req.body.name).trim();
  if (req.body?.nickname) updates.nickname = String(req.body.nickname).trim();
  if (req.body?.bio) updates.bio = String(req.body.bio).trim();

  if (req.file) {
    updates.profile_picture = {
      key: req.file.filename,
      url: `/uploads/${req.file.filename}`,
    };
  }

  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
    .select("_id name nickname username email role profile_picture bio isOnline")
    .lean();

  if (!user) throw createError(404, "User not found");

  return res.status(200).json({
    user: safeUserOut(user, { includeEmail: true, includeRole: true }),
  });
}