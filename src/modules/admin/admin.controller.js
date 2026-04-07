import createError from "http-errors";
import mongoose from "mongoose";
import path from "path";
import { unlink } from "fs/promises";

import User from "../../models/User.js";
import Cosmetic from "../../models/Cosmetic.js";
import { notifyNewCosmeticAvailable } from "../../services/push-notification.service.js";
import { disconnectUserSockets, emitToUserRoom } from "../../sockets/realtime.js";

const USER_ROLES = new Set(["unassigned", "sourcer", "investor", "admin"]);
const COSMETIC_TYPES = new Set(["board", "pieces", "theme", "skin"]);

function normalizeCosmeticType(v) {
  const raw = asString(v).toLowerCase();
  if (raw === "theme") return "board";
  if (raw === "skin") return "pieces";
  return raw;
}

function asString(v) {
  return String(v ?? "").trim();
}

function normalizeCosmeticId(v) {
  return asString(v)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function cosmeticIdSeed(name, type) {
  const t = normalizeCosmeticType(type) || "cosmetic";
  const slug = asString(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const core = slug || "item";
  return normalizeCosmeticId(`${t}_${core}`);
}

async function ensureUniqueCosmeticId(baseId) {
  const base = normalizeCosmeticId(baseId) || `cosmetic_${Date.now().toString(36)}`;
  let candidate = base;

  for (let i = 0; i < 30; i += 1) {
    const dup = await Cosmetic.findOne({ cosmeticId: candidate }).select("_id").lean();
    if (!dup) return candidate;
    const suffix = String(i + 2);
    const room = Math.max(1, 64 - suffix.length - 1);
    candidate = `${base.slice(0, room)}_${suffix}`;
  }

  const fallback = `${base.slice(0, 54)}_${Date.now().toString(36).slice(-8)}`;
  return normalizeCosmeticId(fallback);
}

function asOptionalBool(v) {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}

function asOptionalNumber(v) {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function activeSuspendedUntil(u) {
  const until = u?.moderation?.suspendedUntil
    ? new Date(u.moderation.suspendedUntil)
    : null;
  if (!until || Number.isNaN(until.getTime())) return null;
  return until.getTime() > Date.now() ? until : null;
}

function isBanned(u) {
  return u?.moderation?.isBanned === true;
}

function userOut(u) {
  const suspendedUntil = activeSuspendedUntil(u);
  const banned = isBanned(u);
  return {
    id: u._id.toString(),
    name: u.name || "",
    nickname: u.nickname || "",
    username: u.username || "",
    email: u.email || "",
    role: u.role || "unassigned",
    emailVerified: u.emailVerified === true,
    profilePic: u.profile_picture?.url || "",
    pointsBalance: Number(u.economy?.pointsBalance || 0),
    coinsBalance: Number(u.economy?.coinsBalance || 0),
    premiumAI: u.entitlements?.premiumAI === true,
    adFree: u.entitlements?.adFree === true,
    banned,
    suspended: Boolean(suspendedUntil),
    suspendedUntil: suspendedUntil ? suspendedUntil.toISOString() : null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function cosmeticOut(c) {
  return {
    id: c._id.toString(),
    cosmeticId: c.cosmeticId,
    type: c.type,
    name: c.name,
    description: c.description || "",
    thumbnailUrl: c.thumbnailUrl || "",
    previewUrl: c.previewUrl || "",
    badge: c.badge || "",
    priceCoins: Number(c.priceCoins || 0),
    unlockByAchievementId: c.unlockByAchievementId || "",
    style: c.style || {},
    sort: Number(c.sort || 0),
    active: c.active !== false,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function cosmeticFilterByIdOrKey(idOrKey) {
  const id = asString(idOrKey);
  if (!id) return null;

  if (mongoose.Types.ObjectId.isValid(id)) {
    return { _id: id };
  }
  return { cosmeticId: id };
}

function fileNameStem(fileName) {
  const base = path.basename(String(fileName || ""), path.extname(String(fileName || "")));
  return asString(base).replace(/[_-]+/g, " ");
}

function absoluteUploadUrl(req, fileName) {
  const protoHeader = asString(req.headers?.["x-forwarded-proto"]);
  const protocol = protoHeader || req.protocol || "https";
  const host = asString(req.get?.("host"));
  if (!host) return `/uploads/${fileName}`;
  return `${protocol}://${host}/uploads/${fileName}`;
}

async function safeDeleteUploadedFile(fileName) {
  const clean = asString(fileName);
  if (!clean) return;
  const fullPath = path.resolve(process.cwd(), "uploads", clean);
  await unlink(fullPath).catch(() => {});
}

export async function listUsersAdmin(req, res) {
  const q = asString(req.query.search || req.query.q);
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const skip = (page - 1) * limit;

  const query = {};
  if (q) {
    const rx = new RegExp(
      q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    query.$or = [{ name: rx }, { nickname: rx }, { username: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return res.ok({
    items: items.map(userOut),
    total,
    page,
    limit,
    pages: Math.max(Math.ceil(total / limit), 1),
  });
}

export async function updateUserAdmin(req, res) {
  const userId = asString(req.params.userId);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw createError(400, "Invalid user id");
  }

  const existing = await User.findById(userId);
  if (!existing) throw createError(404, "User not found");

  const updates = {};

  if (req.body?.name !== undefined) updates.name = asString(req.body.name);
  if (req.body?.nickname !== undefined) updates.nickname = asString(req.body.nickname);

  const moderationBody =
    req.body?.moderation && typeof req.body.moderation === "object"
      ? req.body.moderation
      : {};

  const action = asString(req.body?.action || moderationBody?.action).toLowerCase();

  const suspend24h =
    asOptionalBool(req.body?.suspend24h) === true ||
    asOptionalBool(req.body?.suspend) === true ||
    asOptionalBool(req.body?.suspended) === true ||
    asOptionalBool(moderationBody?.suspend24h) === true ||
    asOptionalBool(moderationBody?.suspend) === true ||
    asOptionalBool(moderationBody?.suspended) === true ||
    action === "suspend24h" ||
    action === "suspend";

  const unsuspend =
    asOptionalBool(req.body?.unsuspend) === true ||
    asOptionalBool(req.body?.unsuspended) === true ||
    asOptionalBool(moderationBody?.unsuspend) === true ||
    asOptionalBool(moderationBody?.unsuspended) === true ||
    action === "unsuspend";

  const ban =
    asOptionalBool(req.body?.ban) === true ||
    asOptionalBool(req.body?.banned) === true ||
    asOptionalBool(moderationBody?.ban) === true ||
    asOptionalBool(moderationBody?.banned) === true ||
    action === "ban";

  const unban =
    asOptionalBool(req.body?.unban) === true ||
    asOptionalBool(req.body?.unbanned) === true ||
    asOptionalBool(moderationBody?.unban) === true ||
    asOptionalBool(moderationBody?.unbanned) === true ||
    action === "unban";
  if (
    [suspend24h, unsuspend, ban, unban].filter(Boolean).length > 1
  ) {
    throw createError(400, "Choose only one moderation action at a time");
  }
  if ((suspend24h || ban) && asString(req.userId) === userId) {
    throw createError(400, "You cannot suspend or ban your own admin account");
  }
  if (suspend24h && isBanned(existing)) {
    throw createError(400, "User is permanently banned. Unban first.");
  }

  if (req.body?.username !== undefined) {
    const username = asString(req.body.username).toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw createError(
        400,
        "Username must be 3-20 characters and contain only letters, numbers, or underscores"
      );
    }

    const dup = await User.findOne({
      _id: { $ne: userId },
      username,
    })
      .select("_id")
      .lean();

    if (dup) throw createError(409, "Username already in use");
    updates.username = username;
  }

  if (req.body?.emailVerified !== undefined) {
    const v = asOptionalBool(req.body.emailVerified);
    if (v === undefined) throw createError(400, "Invalid emailVerified value");
    updates.emailVerified = v;
  }

  if (req.body?.role !== undefined) {
    const role = asString(req.body.role).toLowerCase();
    if (!USER_ROLES.has(role)) throw createError(400, "Invalid role");
    updates.role = role;
  }

  const points = asOptionalNumber(req.body?.pointsBalance);
  if (points !== undefined) updates["economy.pointsBalance"] = Math.max(0, points);

  const coins = asOptionalNumber(req.body?.coinsBalance);
  if (coins !== undefined) updates["economy.coinsBalance"] = Math.max(0, coins);

  if (req.body?.premiumAI !== undefined) {
    const v = asOptionalBool(req.body.premiumAI);
    if (v === undefined) throw createError(400, "Invalid premiumAI value");
    updates["entitlements.premiumAI"] = v;
  }

  if (req.body?.adFree !== undefined) {
    const v = asOptionalBool(req.body.adFree);
    if (v === undefined) throw createError(400, "Invalid adFree value");
    updates["entitlements.adFree"] = v;
  }

  if (suspend24h) {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    updates["moderation.suspendedUntil"] = until;
    updates["moderation.suspendedAt"] = new Date();
    updates["moderation.suspendedReason"] = asString(req.body?.suspendedReason) || "Suspended by admin";
    if (req.userId && mongoose.Types.ObjectId.isValid(req.userId)) {
      updates["moderation.suspendedBy"] = req.userId;
    }
  }

  if (unsuspend) {
    updates["moderation.suspendedUntil"] = null;
    updates["moderation.suspendedAt"] = null;
    updates["moderation.suspendedReason"] = "";
    updates["moderation.suspendedBy"] = null;
  }

  if (ban) {
    updates["moderation.isBanned"] = true;
    updates["moderation.bannedAt"] = new Date();
    updates["moderation.bannedReason"] = asString(req.body?.bannedReason) || "Permanently banned by admin";
    updates["moderation.bannedBy"] =
      req.userId && mongoose.Types.ObjectId.isValid(req.userId) ? req.userId : null;
    updates["moderation.suspendedUntil"] = null;
    updates["moderation.suspendedAt"] = null;
    updates["moderation.suspendedReason"] = "";
    updates["moderation.suspendedBy"] = null;
  }

  if (unban) {
    updates["moderation.isBanned"] = false;
    updates["moderation.bannedAt"] = null;
    updates["moderation.bannedReason"] = "";
    updates["moderation.bannedBy"] = null;
  }

  if (Object.keys(updates).length === 0) {
    throw createError(400, "No valid fields provided");
  }

  const updateDoc = { $set: updates };
  if (suspend24h || unsuspend || ban || unban) {
    updateDoc.$unset = { refreshToken: 1 };
  }

  const updated = await User.findByIdAndUpdate(userId, updateDoc, {
    new: true,
    runValidators: true,
  }).lean();

  if (suspend24h || ban) {
    const action = ban ? "ban" : "suspend24h";
    const suspendedUntil =
      suspend24h && updated?.moderation?.suspendedUntil
        ? new Date(updated.moderation.suspendedUntil).toISOString()
        : null;
    const message = ban
      ? "Your account has been permanently banned by admin. You have been logged out."
      : suspendedUntil
          ? `Your account has been suspended by admin until ${suspendedUntil}. You have been logged out.`
          : "Your account has been suspended by admin. You have been logged out.";

    emitToUserRoom(userId, "moderation:action", {
      action,
      forceLogout: true,
      message,
      suspendedUntil,
      at: new Date().toISOString(),
    });

    // Give the client a brief chance to receive the event, then force-close sockets.
    setTimeout(() => {
      void disconnectUserSockets(userId);
    }, 220);
  }

  return res.ok({ user: userOut(updated) });
}

export async function deleteUserAdmin(req, res) {
  const userId = asString(req.params.userId);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw createError(400, "Invalid user id");
  }

  if (asString(req.userId) === userId) {
    throw createError(400, "You cannot delete your own admin account");
  }

  const deleted = await User.findByIdAndDelete(userId).lean();
  if (!deleted) throw createError(404, "User not found");

  return res.ok({ deleted: true, userId });
}

export async function listCosmeticsAdmin(_req, res) {
  const list = await Cosmetic.find({}).sort({ sort: 1, createdAt: -1 }).lean();
  return res.ok({ items: list.map(cosmeticOut) });
}

export async function createCosmeticAdmin(req, res) {
  const providedCosmeticId = normalizeCosmeticId(req.body?.cosmeticId);
  const type = normalizeCosmeticType(req.body?.type);
  const name = asString(req.body?.name);
  const description = asString(req.body?.description);
  const thumbnailUrl = asString(req.body?.thumbnailUrl);
  const previewUrl = asString(req.body?.previewUrl);
  const badge = asString(req.body?.badge);
  const priceCoins = asOptionalNumber(req.body?.priceCoins) ?? 0;
  const unlockByAchievementId = asString(req.body?.unlockByAchievementId);
  const sort = asOptionalNumber(req.body?.sort) ?? 0;
  const active = asOptionalBool(req.body?.active);
  const style =
    req.body?.style && typeof req.body.style === "object" ? req.body.style : {};

  if (!name) throw createError(400, "name is required");
  if (!COSMETIC_TYPES.has(asString(req.body?.type).toLowerCase())) {
    throw createError(400, "type must be board, pieces, theme, or skin");
  }

  let cosmeticId = providedCosmeticId;

  if (cosmeticId) {
    const dup = await Cosmetic.findOne({ cosmeticId }).select("_id").lean();
    if (dup) throw createError(409, "cosmeticId already exists");
  } else {
    cosmeticId = await ensureUniqueCosmeticId(cosmeticIdSeed(name, type));
  }

  const created = await Cosmetic.create({
    cosmeticId,
    type,
    name,
    description,
    thumbnailUrl,
    previewUrl,
    badge,
    priceCoins: Math.max(0, priceCoins),
    unlockByAchievementId,
    sort,
    active: active === undefined ? true : active,
    style,
  });

  if (created.active !== false) {
    void notifyNewCosmeticAvailable(created).catch(() => {});
  }

  return res.created({ item: cosmeticOut(created) });
}

export async function uploadBoardImageAndCreateAdmin(req, res) {
  const file = req.file;
  if (!file) throw createError(400, "image file is required");

  const uploadUrl = absoluteUploadUrl(req, file.filename);
  const name = asString(req.body?.name) || fileNameStem(file.originalname) || "Board Theme";
  const priceCoins = asOptionalNumber(req.body?.priceCoins) ?? 0;
  const sortFromBody = asOptionalNumber(req.body?.sort);
  const active = asOptionalBool(req.body?.active);

  try {
    const maxBoard = await Cosmetic.findOne({ type: "board" })
      .sort({ sort: -1 })
      .select("sort")
      .lean();
    const resolvedSort =
      sortFromBody !== undefined ? sortFromBody : Number(maxBoard?.sort || 0) + 10;

    req.body = {
      type: "board",
      name,
      thumbnailUrl: uploadUrl,
      previewUrl: uploadUrl,
      priceCoins: Math.max(0, priceCoins),
      sort: resolvedSort,
      active: active === undefined ? true : active,
    };

    return await createCosmeticAdmin(req, res);
  } catch (err) {
    await safeDeleteUploadedFile(file.filename);
    throw err;
  }
}

export async function updateCosmeticAdmin(req, res) {
  const filter = cosmeticFilterByIdOrKey(req.params.cosmeticId);
  if (!filter) throw createError(400, "Invalid cosmetic id");

  const current = await Cosmetic.findOne(filter);
  if (!current) throw createError(404, "Cosmetic not found");

  const updates = {};

  if (req.body?.cosmeticId !== undefined) {
    const nextId = normalizeCosmeticId(req.body.cosmeticId);
    if (!nextId) throw createError(400, "cosmeticId cannot be empty");

    const dup = await Cosmetic.findOne({
      cosmeticId: nextId,
      _id: { $ne: current._id },
    })
      .select("_id")
      .lean();
    if (dup) throw createError(409, "cosmeticId already exists");
    updates.cosmeticId = nextId;
  }

  if (req.body?.type !== undefined) {
    const rawType = asString(req.body.type).toLowerCase();
    if (!COSMETIC_TYPES.has(rawType)) {
      throw createError(400, "type must be board, pieces, theme, or skin");
    }
    updates.type = normalizeCosmeticType(rawType);
  }

  if (req.body?.name !== undefined) {
    const n = asString(req.body.name);
    if (!n) throw createError(400, "name cannot be empty");
    updates.name = n;
  }
  if (req.body?.description !== undefined) updates.description = asString(req.body.description);
  if (req.body?.thumbnailUrl !== undefined) updates.thumbnailUrl = asString(req.body.thumbnailUrl);
  if (req.body?.previewUrl !== undefined) updates.previewUrl = asString(req.body.previewUrl);
  if (req.body?.badge !== undefined) updates.badge = asString(req.body.badge);
  if (req.body?.priceCoins !== undefined) {
    const n = asOptionalNumber(req.body.priceCoins);
    if (n === undefined) throw createError(400, "Invalid priceCoins value");
    updates.priceCoins = Math.max(0, n);
  }
  if (req.body?.unlockByAchievementId !== undefined) {
    updates.unlockByAchievementId = asString(req.body.unlockByAchievementId);
  }
  if (req.body?.sort !== undefined) {
    const n = asOptionalNumber(req.body.sort);
    if (n === undefined) throw createError(400, "Invalid sort value");
    updates.sort = n;
  }
  if (req.body?.active !== undefined) {
    const v = asOptionalBool(req.body.active);
    if (v === undefined) throw createError(400, "Invalid active value");
    updates.active = v;
  }
  if (req.body?.style !== undefined) {
    if (!req.body.style || typeof req.body.style !== "object") {
      throw createError(400, "style must be an object");
    }
    updates.style = req.body.style;
  }

  if (Object.keys(updates).length === 0) {
    throw createError(400, "No valid fields provided");
  }

  const shouldNotifyAsNew =
    updates.active === true && current.active === false;

  const updated = await Cosmetic.findByIdAndUpdate(
    current._id,
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();

  if (shouldNotifyAsNew && updated?.active !== false) {
    void notifyNewCosmeticAvailable(updated).catch(() => {});
  }

  return res.ok({ item: cosmeticOut(updated) });
}

export async function deleteCosmeticAdmin(req, res) {
  const filter = cosmeticFilterByIdOrKey(req.params.cosmeticId);
  if (!filter) throw createError(400, "Invalid cosmetic id");

  const deleted = await Cosmetic.findOneAndDelete(filter).lean();
  if (!deleted) throw createError(404, "Cosmetic not found");

  return res.ok({ deleted: true, cosmeticId: deleted.cosmeticId });
}
