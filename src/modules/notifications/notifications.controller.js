import createError from "http-errors";

import {
  registerPushDevice,
  unregisterPushDevice,
  heartbeatPushActivity,
} from "../../services/push-notification.service.js";

function asString(v) {
  return String(v ?? "").trim();
}

function requireUserId(req) {
  const userId = asString(req.userId || req.user?.id || req.user?.sub);
  if (!userId) throw createError(401, "Authentication required");
  return userId;
}

export async function registerDevice(req, res) {
  const userId = requireUserId(req);
  const token = asString(req.body?.token);
  if (!token) throw createError(400, "token is required");

  await registerPushDevice(userId, {
    token,
    platform: req.body?.platform,
    appVersion: req.body?.appVersion,
    locale: req.body?.locale,
    timezone: req.body?.timezone,
    enabled: req.body?.enabled,
  });

  return res.ok({ registered: true });
}

export async function unregisterDevice(req, res) {
  const userId = requireUserId(req);
  await unregisterPushDevice(userId, {
    token: req.body?.token,
    enabled: req.body?.enabled,
  });
  return res.ok({ unregistered: true });
}

export async function heartbeat(req, res) {
  const userId = requireUserId(req);
  await heartbeatPushActivity(userId);
  return res.ok({ alive: true });
}
