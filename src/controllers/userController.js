// src/controllers/userController.js
import createError from "http-errors";
import mongoose from "mongoose";
import User from "../models/User.js";
import { deleteUploadFileByKey } from "../utils/deleteUploadFile.js";

function normUsername(v) {
  return String(v ?? "").trim();
}
function isValidUsername(username) {
  const u = normUsername(username);
  return /^[A-Za-z0-9_]{3,20}$/.test(u);
}

function escapeRegex(v) {
  return String(v ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBodyPicValue(v) {
  if (v == null) return "";

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "";
    if ((s.startsWith("{") || s.startsWith("[")) && s.length <= 2000) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === "object" && typeof parsed.url === "string") {
          return parsed.url.trim();
        }
      } catch (_) {}
    }
    return s;
  }

  if (typeof v === "object") {
    if (typeof v.url === "string") return v.url.trim();
    if (typeof v.path === "string") return v.path.trim();
    return "";
  }

  return String(v).trim();
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
 *    - preset string: profilePicUrl/profilePic/profile_picture (legacy)
 */
export async function editProfile(req, res) {
  const userId = req.userId;

  // ✅ Load current user so we can delete old uploaded avatar if replaced
  const current = await User.findById(userId)
    .select("_id name nickname username email role profile_picture bio isOnline")
    .lean();

  if (!current) throw createError(404, "User not found");

  const oldKey = current.profile_picture?.key || "";

  const updates = {};

  if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body?.bio !== undefined) updates.bio = String(req.body.bio).trim();

  const nicknameBody =
    req.body?.nickname !== undefined ? req.body.nickname : req.body?.displayName;
  if (nicknameBody !== undefined) {
    updates.nickname = String(nicknameBody).trim();
  }

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
      username: { $regex: new RegExp(`^${escapeRegex(u)}$`, "i") },
      _id: { $ne: userId },
    })
      .select("_id")
      .lean();

    if (exists) throw createError(409, "Username already in use");

    updates.username = u;
  }

  // ✅ preset avatar url/key without upload (legacy)
  const rawBodyPic =
    req.body?.profilePicUrl ||
    req.body?.profilePic ||
    req.body?.profile_picture?.url ||
    req.body?.profile_picture;
  const bodyPic = normalizeBodyPicValue(rawBodyPic);

  let newKey = "";

  if (!req.file && bodyPic) {
    const url = String(bodyPic).trim();
    if (!url) throw createError(400, "Profile picture URL cannot be empty");
    updates.profile_picture = { key: "", url };
    newKey = ""; // preset
  }

  // ✅ custom uploaded avatar
  if (req.file) {
    newKey = req.file.filename;
    updates.profile_picture = {
      key: newKey,
      url: `/uploads/${req.file.filename}`,
    };
  }

  // Keep legacy/old users updatable even if their old doc missed profile_picture.url.
  if (!updates.profile_picture) {
    const currentPic = String(current.profile_picture?.url || "").trim();
    if (!currentPic) {
      const seed = encodeURIComponent(
        String(current.username || current._id?.toString() || "player")
      );
      updates.profile_picture = {
        key: "",
        url: `https://api.dicebear.com/9.x/bottts/png?seed=${seed}`,
      };
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(200).json({
      user: safeUserOut(current, { includeEmail: true, includeRole: true }),
    });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  )
    .select("_id name nickname username email role profile_picture bio isOnline")
    .lean();

  if (!user) throw createError(404, "User not found");

  // ✅ Delete old uploaded avatar file if replaced by a new uploaded one
  if (req.file && oldKey && oldKey !== newKey) {
    await deleteUploadFileByKey(oldKey);
  }

  return res.status(200).json({
    user: safeUserOut(user, { includeEmail: true, includeRole: true }),
  });
}
