// src/controllers/userController.js
import createError from "http-errors";
import mongoose from "mongoose";
import User from "../models/User.js";

function normUsername(v) {
  return String(v ?? "").trim().toLowerCase();
}
function isValidUsername(username) {
  const u = normUsername(username);
  return /^[a-z0-9_]{3,20}$/.test(u);
}

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

export async function getPublicProfile(req, res) {
  const id = String(req.params.id || "").trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(400, "Invalid user id");
  }

  const user = await User.findById(id)
    .select(
      "_id name nickname username profile_picture bio isOnline gamingStats economy entitlements"
    )
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
 * Supports:
 * - name, nickname, bio
 * - username (validated + unique)
 * - profile picture:
 *    - uploaded file: profilePic (multer)
 *    - preset string: profilePicUrl/profilePic/profile_picture
 */
export async function editProfile(req, res) {
  const userId = req.userId;

  const updates = {};

  if (req.body?.name) updates.name = String(req.body.name).trim();
  if (req.body?.nickname) updates.nickname = String(req.body.nickname).trim();
  if (req.body?.bio) updates.bio = String(req.body.bio).trim();

  // ✅ allow username change
  if (req.body?.username != null) {
    const u = normUsername(req.body.username);
    if (!u || !isValidUsername(u)) {
      throw createError(
        400,
        "Username must be 3-20 characters and contain only letters, numbers, or underscores"
      );
    }

    const exists = await User.findOne({
      username: u,
      _id: { $ne: userId },
    })
      .select("_id")
      .lean();

    if (exists) throw createError(409, "Username already in use");

    updates.username = u;
  }

  // ✅ preset avatar url/key without upload
  const bodyPic =
    req.body?.profilePicUrl ||
    req.body?.profilePic ||
    req.body?.profile_picture?.url ||
    req.body?.profile_picture;

  if (!req.file && bodyPic != null) {
    const url = String(bodyPic).trim();
    if (!url) throw createError(400, "Profile picture URL cannot be empty");
    updates.profile_picture = { key: "", url };
  }

  // ✅ custom uploaded avatar
  if (req.file) {
    updates.profile_picture = {
      key: req.file.filename,
      url: `/uploads/${req.file.filename}`,
    };
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  )
    .select("_id name nickname username email role profile_picture bio isOnline")
    .lean();

  if (!user) throw createError(404, "User not found");

  return res.status(200).json({
    user: safeUserOut(user, { includeEmail: true, includeRole: true }),
  });
}