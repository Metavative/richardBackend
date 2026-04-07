import mongoose from "mongoose";

import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import { presenceStore } from "../stores/presence.store.js";
import { env } from "../config/env.js";
import { sendPushToTokens, isPushEnabled } from "./fcm.service.js";

const MAX_DEVICE_TOKENS = 8;

let _started = false;
let _friendsTimer = null;
let _inactiveTimer = null;

function asString(v) {
  return String(v ?? "").trim();
}

function asObjectIdArray(ids) {
  return (ids || [])
    .map((v) => asString(v))
    .filter((v) => mongoose.Types.ObjectId.isValid(v));
}

function tokenFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return asString(entry);
  return asString(entry.token);
}

function extractTokens(user) {
  const entries = user?.notifications?.deviceTokens || [];
  return Array.from(
    new Set(entries.map(tokenFromEntry).filter((t) => t.length >= 20))
  );
}

function nowUtc() {
  return new Date();
}

export async function registerPushDevice(userId, input = {}) {
  const uid = asString(userId);
  if (!mongoose.Types.ObjectId.isValid(uid)) {
    throw new Error("Invalid user id");
  }

  const token = asString(input.token);
  if (!token) throw new Error("token is required");
  if (token.length < 20) throw new Error("token is invalid");

  const now = nowUtc();
  const platform = asString(input.platform || "unknown").toLowerCase();
  const appVersion = asString(input.appVersion);
  const locale = asString(input.locale);
  const timezone = asString(input.timezone);
  // Explicit opt-in only: keep disabled unless client intentionally enables.
  const enabled =
    input.enabled === true ||
    asString(input.enabled).toLowerCase() === "true";

  await User.updateMany(
    { "notifications.deviceTokens.token": token },
    { $pull: { "notifications.deviceTokens": { token } } }
  );

  const user = await User.findById(uid).select("notifications").lean();
  if (!user) throw new Error("User not found");

  const prev = Array.isArray(user?.notifications?.deviceTokens)
    ? user.notifications.deviceTokens
    : [];

  const next = prev
    .filter((x) => tokenFromEntry(x) !== token)
    .map((x) => ({
      token: tokenFromEntry(x),
      platform: asString(x.platform || "unknown"),
      appVersion: asString(x.appVersion),
      locale: asString(x.locale),
      timezone: asString(x.timezone),
      lastSeenAt: x.lastSeenAt ? new Date(x.lastSeenAt) : now,
    }));

  next.unshift({
    token,
    platform,
    appVersion,
    locale,
    timezone,
    lastSeenAt: now,
  });

  const trimmed = next.slice(0, MAX_DEVICE_TOKENS);

  await User.updateOne(
    { _id: uid },
    {
      $set: {
        "notifications.pushEnabled": enabled,
        "notifications.deviceTokens": trimmed,
        "notifications.lastActiveAt": now,
      },
    }
  );

  return { ok: true, token };
}

export async function unregisterPushDevice(userId, input = {}) {
  const uid = asString(userId);
  if (!mongoose.Types.ObjectId.isValid(uid)) {
    throw new Error("Invalid user id");
  }

  const token = asString(input.token);
  const now = nowUtc();

  const update = {
    $set: {
      "notifications.lastActiveAt": now,
    },
  };

  if (token) {
    update.$pull = { "notifications.deviceTokens": { token } };
  } else {
    update.$set["notifications.deviceTokens"] = [];
  }

  if (input.enabled === false || !token) {
    update.$set["notifications.pushEnabled"] = false;
  }

  await User.updateOne({ _id: uid }, update);
  return { ok: true };
}

export async function heartbeatPushActivity(userId) {
  const uid = asString(userId);
  if (!mongoose.Types.ObjectId.isValid(uid)) return;
  await User.updateOne(
    { _id: uid },
    { $set: { "notifications.lastActiveAt": nowUtc() } }
  );
}

async function _sendPushToUsers(userIds, payload) {
  const ids = asObjectIdArray(userIds);
  if (ids.length === 0) return { sent: 0, failed: 0, skipped: true };

  const users = await User.find({
    _id: { $in: ids },
    "notifications.pushEnabled": { $ne: false },
    "notifications.deviceTokens.0": { $exists: true },
  })
    .select("_id notifications.deviceTokens")
    .lean();

  const tokens = users.flatMap(extractTokens);
  return sendPushToTokens(tokens, payload);
}

async function _runFriendsOnlineNudgeScan() {
  if (!isPushEnabled()) return;

  const online = presenceStore
    .snapshot()
    .map((x) => asString(x.userId))
    .filter((x) => mongoose.Types.ObjectId.isValid(x));

  if (online.length < env.PUSH_FRIENDS_ONLINE_MIN) return;

  const onlineSet = new Set(online);
  const rows = await FriendRequest.find({
    status: "accepted",
    $or: [{ from: { $in: online } }, { to: { $in: online } }],
  })
    .select("from to")
    .lean();

  const friendOnlineCount = new Map();
  for (const row of rows) {
    const from = asString(row.from);
    const to = asString(row.to);
    const fromOnline = onlineSet.has(from);
    const toOnline = onlineSet.has(to);

    if (fromOnline && !toOnline) {
      friendOnlineCount.set(to, (friendOnlineCount.get(to) || 0) + 1);
    }
    if (toOnline && !fromOnline) {
      friendOnlineCount.set(from, (friendOnlineCount.get(from) || 0) + 1);
    }
  }

  const minOnline = Math.max(1, env.PUSH_FRIENDS_ONLINE_MIN);
  const candidates = Array.from(friendOnlineCount.entries())
    .filter(([, c]) => c >= minOnline)
    .map(([id]) => id);

  if (candidates.length === 0) return;

  const cooldownBefore = new Date(
    Date.now() - env.PUSH_FRIENDS_COOLDOWN_MIN * 60 * 1000
  );

  const targetUsers = await User.find({
    _id: { $in: candidates },
    "notifications.pushEnabled": { $ne: false },
    "notifications.deviceTokens.0": { $exists: true },
    $or: [
      { "notifications.lastFriendsOnlinePushAt": { $exists: false } },
      { "notifications.lastFriendsOnlinePushAt": { $lt: cooldownBefore } },
    ],
  })
    .select("_id notifications.deviceTokens")
    .lean();

  if (targetUsers.length === 0) return;

  const now = nowUtc();
  const touched = [];

  for (const user of targetUsers) {
    const uid = asString(user._id);
    const count = friendOnlineCount.get(uid) || 0;
    if (count < minOnline) continue;

    const result = await sendPushToTokens(extractTokens(user), {
      title: `${count} friends are online`,
      body: "Jump into multiplayer and play with them now.",
      data: {
        type: "friends_online",
        friendsOnline: count,
      },
    });

    if (result.sent > 0) touched.push(uid);
  }

  if (touched.length > 0) {
    await User.updateMany(
      { _id: { $in: touched } },
      { $set: { "notifications.lastFriendsOnlinePushAt": now } }
    );
  }
}

async function _runInactiveReminderScan() {
  if (!isPushEnabled()) return;

  const inactiveBefore = new Date(
    Date.now() - env.PUSH_INACTIVE_DAYS * 24 * 60 * 60 * 1000
  );
  const reminderBefore = new Date(
    Date.now() - env.PUSH_INACTIVE_COOLDOWN_HOURS * 60 * 60 * 1000
  );

  const onlineIds = asObjectIdArray(
    presenceStore.snapshot().map((x) => asString(x.userId))
  );

  const query = {
    "notifications.pushEnabled": { $ne: false },
    "notifications.deviceTokens.0": { $exists: true },
    _id: { $nin: onlineIds },
    $and: [
      {
        $or: [
          { "notifications.lastActiveAt": { $lt: inactiveBefore } },
          {
            "notifications.lastActiveAt": { $exists: false },
            updatedAt: { $lt: inactiveBefore },
          },
        ],
      },
      {
        $or: [
          { "notifications.lastInactivityReminderAt": { $exists: false } },
          { "notifications.lastInactivityReminderAt": { $lt: reminderBefore } },
        ],
      },
    ],
  };

  const users = await User.find(query)
    .select("_id notifications.deviceTokens")
    .limit(500)
    .lean();

  if (users.length === 0) return;

  const now = nowUtc();
  const touched = [];

  for (const user of users) {
    const result = await sendPushToTokens(extractTokens(user), {
      title: "We miss you in LA-TREL",
      body: "It has been a few days. Come back and play a quick match.",
      data: {
        type: "inactivity_reminder",
      },
    });
    if (result.sent > 0) touched.push(asString(user._id));
  }

  if (touched.length > 0) {
    await User.updateMany(
      { _id: { $in: touched } },
      { $set: { "notifications.lastInactivityReminderAt": now } }
    );
  }
}

async function _safeRun(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.warn(`[push] ${name} scan failed:`, err?.message || err);
  }
}

export function startPushNotificationJobs() {
  if (_started) return;
  _started = true;

  _friendsTimer = setInterval(() => {
    void _safeRun("friends-online", _runFriendsOnlineNudgeScan);
  }, env.PUSH_FRIENDS_SCAN_MS);

  _inactiveTimer = setInterval(() => {
    void _safeRun("inactive-reminder", _runInactiveReminderScan);
  }, env.PUSH_INACTIVE_SCAN_MS);

  _friendsTimer.unref?.();
  _inactiveTimer.unref?.();

  void _safeRun("friends-online-initial", _runFriendsOnlineNudgeScan);
  void _safeRun("inactive-reminder-initial", _runInactiveReminderScan);
}

export async function notifyNewCosmeticAvailable(cosmetic) {
  if (!isPushEnabled()) return { sent: 0, failed: 0, skipped: true };
  if (!cosmetic || cosmetic.active === false) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const name = asString(cosmetic.name || "New skin");
  const cosmeticId = asString(cosmetic.cosmeticId);

  const users = await User.find({
    "notifications.pushEnabled": { $ne: false },
    "notifications.deviceTokens.0": { $exists: true },
  })
    .select("notifications.deviceTokens")
    .lean();

  const tokens = users.flatMap(extractTokens);
  return sendPushToTokens(tokens, {
    title: "New skin in the store",
    body: `${name} is now available. Open the store to check it out.`,
    data: {
      type: "new_skin",
      cosmeticId,
      screen: "store",
    },
  });
}
