// src/controllers/authController.js
import crypto from "crypto";
import bcrypt from "bcryptjs";
import createError from "http-errors";
import { validationResult } from "express-validator";

import User from "../models/User.js";
import { VerificationCode } from "../models/VerificationCode.js";
import { PasswordResetCode } from "../models/PasswordResetCode.js";
import { sendEmail } from "../utils/sendEmail.js";
import { env } from "../config/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/generateTokens.js";

import { deleteUploadFileByKey } from "../utils/deleteUploadFile.js";
import { getFirebaseAdminAuth } from "../services/fcm.service.js";

// ---------- helpers ----------
const make5DigitCode = () => String(crypto.randomInt(10000, 100000));
const hashToken = (token) =>
  bcrypt.hash(String(token), Number(env.TOKEN_SALT_ROUNDS || 12));

function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createError(400, {
      message: "Validation failed",
      errors: errors.array(),
    });
  }
}

const isProd = env.NODE_ENV === "production";

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function verifyFirebaseIdTokenViaRest(idToken) {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim();
  if (!apiKey) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!resp.ok) return null;

    const payload = await resp.json();
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const u = users[0];
    if (!u) return null;

    return {
      uid: String(u.localId || "").trim(),
      email: String(u.email || "").trim(),
      email_verified:
        u.emailVerified === true || String(u.emailVerified || "").toLowerCase() === "true",
      name: String(u.displayName || "").trim(),
      picture: String(u.photoUrl || "").trim(),
    };
  } catch {
    return null;
  }
}

function normUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function isValidUsername(username) {
  const u = normUsername(username);
  return /^[a-z0-9_]{3,20}$/.test(u);
}

function pickRefreshToken(req) {
  const fromBody = req.body?.refreshToken;
  if (fromBody && String(fromBody).trim()) return String(fromBody).trim();

  const fromCookie = req.cookies?.refreshToken;
  if (fromCookie && String(fromCookie).trim()) return String(fromCookie).trim();

  return null;
}

function buildLoginPayload(user) {
  const displayName =
    (user.nickname && String(user.nickname).trim()) ||
    (user.username && String(user.username).trim()) ||
    (user.name && String(user.name).trim()) ||
    "Player";

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    username: user.username,
    nickname: user.nickname || "",
    displayName,
    profilePic: user.profile_picture?.url || null,
  };
}

function getActiveSuspendedUntil(user) {
  const until = user?.moderation?.suspendedUntil
    ? new Date(user.moderation.suspendedUntil)
    : null;
  if (!until) return null;
  if (Number.isNaN(until.getTime())) return null;
  return until.getTime() > Date.now() ? until : null;
}

function isBanned(user) {
  return user?.moderation?.isBanned === true;
}

function bannedLoginResponse(res, user) {
  if (!isBanned(user)) return false;
  return res.status(403).json({
    message: "Your account has been permanently banned. Contact support to appeal.",
    code: "ACCOUNT_BANNED",
  });
}

function suspensionLoginResponse(res, user) {
  const until = getActiveSuspendedUntil(user);
  if (!until) return false;

  return res.status(403).json({
    message: `Your account is suspended until ${until.toISOString()}`,
    code: "ACCOUNT_SUSPENDED",
    suspendedUntil: until.toISOString(),
  });
}

function toSafeUsernameSeed(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!normalized) return "player";
  if (/^[a-z0-9_]{3,20}$/.test(normalized)) return normalized;

  const stripped = normalized.replace(/[^a-z0-9_]/g, "");
  if (!stripped) return "player";
  if (stripped.length >= 3) return stripped.slice(0, 20);

  return `${stripped}${"player".slice(0, 3 - stripped.length)}`.slice(0, 20);
}

async function ensureUniqueUsername(seed) {
  const base = toSafeUsernameSeed(seed).slice(0, 20);
  let candidate = base.length >= 3 ? base : "player";

  let taken = await User.findOne({ username: candidate }).select("_id").lean();
  if (!taken) return candidate;

  for (let i = 0; i < 15; i += 1) {
    const suffix = String(crypto.randomInt(100, 9999));
    const room = Math.max(3, 20 - suffix.length - 1);
    candidate = `${base.slice(0, room)}_${suffix}`;
    taken = await User.findOne({ username: candidate }).select("_id").lean();
    if (!taken) return candidate;
  }

  return `player_${Date.now().toString().slice(-6)}`.slice(0, 20);
}

function fallbackNameFromEmail(email) {
  const local = String(email || "").split("@")[0] || "player";
  const cleaned = local.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return "Player";
  return cleaned.slice(0, 40);
}

function fallbackProfilePic(email) {
  const seed = encodeURIComponent(String(email || "player"));
  return `https://api.dicebear.com/9.x/identicon/png?seed=${seed}`;
}

// ---------- REGISTER ----------
export async function register(req, res, next) {
  try {
    assertValid(req);

    const { name, email, password } = req.body;

    const usernameRaw = req.body?.username;

    const profilePicRaw =
      req.body?.profilePicUrl ||
      req.body?.profilePic ||
      req.body?.profile_picture?.url ||
      req.body?.profile_picture;

    const safeEmail = normEmail(email);

    const safeName =
      name && String(name).trim().length > 0 ? String(name).trim() : "Player";

    const safeUsername = normUsername(usernameRaw);

    if (!safeUsername || !isValidUsername(safeUsername)) {
      return res.status(400).json({
        message:
          "Username is required (3-20 chars, letters/numbers/underscore only)",
      });
    }

    let profilePicUrl = "";
    let profilePicKey = "";

    if (req.file) {
      profilePicKey = req.file.filename;
      profilePicUrl = `/uploads/${req.file.filename}`;
    } else {
      profilePicUrl = String(profilePicRaw || "").trim();
      profilePicKey = "";
    }

    if (!profilePicUrl) {
      return res.status(400).json({
        message: "Profile picture is required",
      });
    }

    const existingUsername = await User.findOne({ username: safeUsername })
      .select("_id emailVerified email")
      .lean();

    if (existingUsername) {
      const sameEmail =
        String(existingUsername.email || "").toLowerCase() === safeEmail;

      if (!sameEmail) {
        return res.status(409).json({ message: "Username already in use" });
      }
    }

    let user = await User.findOne({ email: safeEmail });

    if (user) {
      if (user.emailVerified) {
        return res.status(409).json({ message: "Email already in use" });
      }

      const oldKey = user.profile_picture?.key || "";

      user.name = safeName || user.name;
      user.email = safeEmail;
      user.password = password;

      user.username = safeUsername;
      user.emailVerified = true;
      user.profile_picture = {
        key: profilePicKey || user.profile_picture?.key || "",
        url: profilePicUrl,
      };

      await user.save();

      if (req.file && oldKey && oldKey !== profilePicKey) {
        await deleteUploadFileByKey(oldKey);
      }
    } else {
      user = await User.create({
        name: safeName,
        email: safeEmail,
        password,
        username: safeUsername,
        emailVerified: true,
        profile_picture: { key: profilePicKey, url: profilePicUrl },
      });
    }

    await VerificationCode.deleteMany({ userId: user._id });
    user = await User.findById(user._id).select(
      "+refreshToken moderation.isBanned moderation.suspendedUntil"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const banned = bannedLoginResponse(res, user);
    if (banned) return banned;

    const suspended = suspensionLoginResponse(res, user);
    if (suspended) return suspended;

    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
    });

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: "Registered successfully",
      uid: user._id,
      email: user.email,
      accessToken,
      refreshToken,
      user: buildLoginPayload(user),
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const keys = Object.keys(err.keyPattern || {});
      if (keys.includes("username")) {
        return res.status(409).json({ message: "Username already in use" });
      }
      if (keys.includes("email")) {
        return res.status(409).json({ message: "Email already in use" });
      }
    }
    next(err);
  }
}

// ---------- RESEND VERIFICATION ----------
export async function resendVerification(req, res, next) {
  try {
    assertValid(req);

    const safeEmail = normEmail(req.body.email);

    const user = await User.findOne({ email: safeEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.emailVerified) {
      return res.status(200).json({
        message: "Email already verified",
        uid: user._id,
        email: user.email,
      });
    }

    await VerificationCode.deleteMany({ userId: user._id });

    const raw = make5DigitCode();
    const codeHash = await hashToken(raw);

    await VerificationCode.create({
      userId: user._id,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await sendEmail({
      to: user.email,
      subject: "Verify your email",
      html: `<p>Your verification code is <b>${raw}</b></p>`,
    });

    return res.status(200).json({
      message: "Verification code sent",
      uid: user._id,
      email: user.email,
    });
  } catch (err) {
    next(err);
  }
}

// ---------- VERIFY EMAIL ----------
// ✅ UPDATED: after verifying code, return tokens + user payload
export async function verifyEmail(req, res, next) {
  try {
    assertValid(req);

    const { uid, code } = req.body;

    const row = await VerificationCode.findOne({ userId: uid });
    if (!row)
      return res.status(400).json({ message: "Code not found or expired" });

    if (row.expiresAt < new Date()) {
      await VerificationCode.deleteMany({ userId: uid });
      return res.status(400).json({ message: "Code expired" });
    }

    const ok = await bcrypt.compare(String(code), row.codeHash);
    if (!ok) return res.status(400).json({ message: "Invalid code" });

    // ✅ mark verified
    await User.findByIdAndUpdate(uid, { emailVerified: true });
    await VerificationCode.deleteMany({ userId: uid });

    // ✅ load user and issue tokens immediately
    const user = await User.findById(uid).select(
      "+refreshToken moderation.isBanned moderation.suspendedUntil"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const banned = bannedLoginResponse(res, user);
    if (banned) return banned;

    const suspended = suspensionLoginResponse(res, user);
    if (suspended) return suspended;

    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
    });

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "Email verified",
      accessToken,
      refreshToken,
      user: buildLoginPayload(user),
    });
  } catch (err) {
    next(err);
  }
}

// ---------- LOGIN ----------
export async function login(req, res, next) {
  try {
    assertValid(req);

    const { email, password } = req.body;
    const safeEmail = normEmail(email);

    const user = await User.findOne({ email: safeEmail }).select(
      "+password +refreshToken moderation.isBanned moderation.suspendedUntil"
    );
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const banned = bannedLoginResponse(res, user);
    if (banned) return banned;

    const suspended = suspensionLoginResponse(res, user);
    if (suspended) return suspended;

    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
    });

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      refreshToken,
      user: buildLoginPayload(user),
    });
  } catch (err) {
    next(err);
  }
}

// ---------- GOOGLE LOGIN ----------
export async function googleLogin(req, res, next) {
  try {
    assertValid(req);

    const firebaseAuth = getFirebaseAdminAuth();
    const firebaseIdToken = String(req.body?.idToken || "").trim();
    const intent = String(req.body?.intent || "login")
      .trim()
      .toLowerCase();

    if (intent !== "login" && intent !== "register") {
      return res
        .status(400)
        .json({ message: "Google intent must be login or register" });
    }

    let decoded = null;

    if (firebaseAuth) {
      try {
        decoded = await firebaseAuth.verifyIdToken(firebaseIdToken, true);
      } catch {
        // Fallback path: verify via Firebase Identity Toolkit when Admin SDK
        // credentials are not fully configured on this environment.
        decoded = await verifyFirebaseIdTokenViaRest(firebaseIdToken);
      }
    } else {
      decoded = await verifyFirebaseIdTokenViaRest(firebaseIdToken);
      if (!decoded) {
        return res.status(503).json({
          message:
            "Google login is not available right now. Please configure Firebase Admin or FIREBASE_WEB_API_KEY.",
        });
      }
    }

    if (!decoded) {
      return res.status(401).json({ message: "Google session is invalid or expired" });
    }

    const safeEmail = normEmail(decoded?.email);
    if (!safeEmail) {
      return res.status(400).json({
        message: "Google account email is missing. Please use another account.",
      });
    }

    const googleName = String(decoded?.name || "").trim();
    const googlePicture = String(decoded?.picture || "").trim();

    let user = await User.findOne({ email: safeEmail }).select(
      "+refreshToken moderation.isBanned moderation.suspendedUntil"
    );

    if (intent === "login" && !user) {
      return res.status(404).json({
        message: "No account found with this Google account. Please register first.",
        code: "GOOGLE_ACCOUNT_NOT_REGISTERED",
      });
    }

    if (intent === "register" && user) {
      return res.status(409).json({
        message: "Account already exists. Please login.",
        code: "GOOGLE_ACCOUNT_ALREADY_EXISTS",
      });
    }

    if (!user) {
      const usernameHint =
        req.body?.username || googleName || safeEmail.split("@")[0] || "player";
      const username = await ensureUniqueUsername(usernameHint);
      const randomPassword = `${crypto.randomBytes(24).toString("hex")}Aa1`;

      user = await User.create({
        name: googleName || fallbackNameFromEmail(safeEmail),
        email: safeEmail,
        password: randomPassword,
        username,
        emailVerified: true,
        profile_picture: {
          key: "",
          url: googlePicture || fallbackProfilePic(safeEmail),
        },
      });
      user = await User.findById(user._id).select("+refreshToken");
    } else if (intent === "login") {
      let changed = false;

      if (!user.emailVerified) {
        user.emailVerified = true;
        changed = true;
      }

      if (!String(user.name || "").trim() && googleName) {
        user.name = googleName;
        changed = true;
      }

      if (!String(user.profile_picture?.url || "").trim()) {
        user.profile_picture = {
          key: "",
          url: googlePicture || fallbackProfilePic(safeEmail),
        };
        changed = true;
      }

      if (changed) {
        await user.save({ validateBeforeSave: false });
      }
    }

    if (!user) return res.status(500).json({ message: "Unable to complete Google login" });

    const banned = bannedLoginResponse(res, user);
    if (banned) return banned;

    const suspended = suspensionLoginResponse(res, user);
    if (suspended) return suspended;

    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
    });

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      refreshToken,
      user: buildLoginPayload(user),
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const keys = Object.keys(err.keyPattern || {});
      if (keys.includes("username")) {
        return res.status(409).json({ message: "Username already in use" });
      }
      if (keys.includes("email")) {
        return res.status(409).json({ message: "Email already in use" });
      }
    }
    next(err);
  }
}

// ---------- REFRESH ----------
export async function refresh(req, res, next) {
  try {
    const token = pickRefreshToken(req);
    if (!token)
      return res.status(401).json({ message: "Missing refresh token" });

    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.sub).select(
      "+refreshToken moderation.isBanned moderation.suspendedUntil"
    );

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const banned = bannedLoginResponse(res, user);
    if (banned) return banned;

    const suspended = suspensionLoginResponse(res, user);
    if (suspended) return suspended;

    const accessToken = generateAccessToken({
      sub: user._id.toString(),
      email: user.email,
    });

    return res.json({ accessToken });
  } catch (err) {
    next(err);
  }
}

// ---------- LOGOUT ----------
export async function logout(req, res) {
  const token = pickRefreshToken(req);

  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.sub, {
        $unset: { refreshToken: 1 },
      });
    } catch {}
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
  });

  return res.json({ message: "Logged out" });
}

// ---------- FORGOT PASSWORD ----------
export async function forgotPassword(req, res, next) {
  try {
    assertValid(req);

    const safeEmail = normEmail(req.body.email);

    const user = await User.findOne({ email: safeEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    await PasswordResetCode.deleteMany({ userId: user._id });

    const raw = make5DigitCode();
    const codeHash = await hashToken(raw);

    await PasswordResetCode.create({
      userId: user._id,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    res.status(200).json({
      message: "Password reset code sent",
      uid: user._id,
      email: user.email,
    });

    sendEmail({
      to: user.email,
      subject: "Reset your password",
      html: `<p>Your password reset code is <b>${raw}</b></p>`,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
}

// ---------- RESET PASSWORD ----------
export async function resetPassword(req, res, next) {
  try {
    assertValid(req);

    const { uid, code, password } = req.body;

    const row = await PasswordResetCode.findOne({ userId: uid });
    if (!row)
      return res.status(400).json({ message: "Code not found or expired" });

    if (row.expiresAt < new Date()) {
      await PasswordResetCode.deleteMany({ userId: uid });
      return res.status(400).json({ message: "Code expired" });
    }

    const ok = await bcrypt.compare(String(code), row.codeHash);
    if (!ok) return res.status(400).json({ message: "Invalid code" });

    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = password;
    await user.save();

    await PasswordResetCode.deleteMany({ userId: uid });

    return res.json({ message: "Password reset successful" });
  } catch (err) {
    next(err);
  }
}

// ---------- SELECT ROLE ----------
export async function selectRole(req, res, next) {
  try {
    assertValid(req);

    const { email, role } = req.body;
    const safeEmail = normEmail(email);

    const user = await User.findOne({ email: safeEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = role;
    await user.save();

    return res.json({ message: "Role selected", role });
  } catch (err) {
    next(err);
  }
}

// ---------- FETCH USERS ----------
export async function fetchUsers(req, res, next) {
  try {
    const users = await User.find().select("_id name email role username");
    return res.json(users);
  } catch (err) {
    next(err);
  }
}

// ---------- DELETE ACCOUNT ----------
export async function deleteAccount(req, res, next) {
  try {
    const userId = req.user.sub;

    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    await Promise.all([
      VerificationCode.deleteMany({ userId }),
      PasswordResetCode.deleteMany({ userId }),
    ]);

    const key = user.profile_picture?.key || "";
    if (key) await deleteUploadFileByKey(key);

    await user.deleteOne();

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
    });

    return res.json({ message: "Account successfully deleted" });
  } catch (err) {
    next(err);
  }
}
