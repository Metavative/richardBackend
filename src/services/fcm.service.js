import admin from "firebase-admin";
import { env } from "../config/env.js";
import User from "../models/User.js";

let _initAttempted = false;
let _enabled = false;

function _parseServiceAccountFromEnv() {
  const rawJson = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch (_) {
      try {
        const decoded = Buffer.from(rawJson, "base64").toString("utf8");
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    }
  }

  if (
    !env.FIREBASE_PROJECT_ID ||
    !env.FIREBASE_CLIENT_EMAIL ||
    !env.FIREBASE_PRIVATE_KEY
  ) {
    return null;
  }

  return {
    project_id: env.FIREBASE_PROJECT_ID,
    client_email: env.FIREBASE_CLIENT_EMAIL,
    private_key: String(env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n"),
  };
}

function _ensureInitialized() {
  if (_initAttempted) return _enabled;
  _initAttempted = true;

  try {
    if (admin.apps.length > 0) {
      _enabled = true;
      return true;
    }

    const serviceAccount = _parseServiceAccountFromEnv();
    if (!serviceAccount) {
      console.warn(
        "[push] Firebase service account is not configured. Push notifications are disabled."
      );
      _enabled = false;
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    _enabled = true;
    console.log("[push] Firebase Admin initialized");
    return true;
  } catch (err) {
    _enabled = false;
    console.warn("[push] Failed to initialize Firebase Admin:", err?.message);
    return false;
  }
}

export function isPushEnabled() {
  return _ensureInitialized();
}

export function getFirebaseAdminAuth() {
  if (!_ensureInitialized()) return null;
  try {
    return admin.auth();
  } catch {
    return null;
  }
}

function normalizeData(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

export async function sendPushToTokens(tokens, { title, body, data = {} }) {
  if (!_ensureInitialized()) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  const uniq = Array.from(
    new Set(
      (tokens || [])
        .map((t) => String(t || "").trim())
        .filter((t) => t.length >= 20)
    )
  );

  if (uniq.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  const normalizedData = normalizeData(data);
  let sent = 0;
  let failed = 0;
  const invalidTokens = [];

  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const resp = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: String(title || "LA-TREL"),
        body: String(body || ""),
      },
      data: normalizedData,
      android: { priority: "high" },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } },
      },
    });

    sent += resp.successCount;
    failed += resp.failureCount;

    resp.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = String(r.error?.code || "");
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-argument")
      ) {
        invalidTokens.push(chunk[idx]);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await User.updateMany(
      {},
      { $pull: { "notifications.deviceTokens": { token: { $in: invalidTokens } } } }
    );
  }

  return {
    sent,
    failed,
    invalidTokens,
    skipped: false,
  };
}
