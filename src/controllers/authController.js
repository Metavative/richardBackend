import crypto from "crypto";
import bcrypt from "bcryptjs";
import createError from "http-errors";
import { validationResult } from "express-validator";

import { User } from "../models/User.js";
import { VerificationCode } from "../models/VerificationCode.js";
import { PasswordResetCode } from "../models/PasswordResetCode.js";
import { sendEmail } from "../utils/sendEmail.js";
import { env } from "../config/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/generateTokens.js";
import FriendRequest from "../models/FriendRequest.js";

// ---------- helpers ----------
const make5DigitCode = () => String(crypto.randomInt(10000, 100000));
const hashToken = (token) => bcrypt.hash(String(token), Number(env.TOKEN_SALT_ROUNDS || 12));

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

// ---------- REGISTER ----------
export async function register(req, res, next) {
  try {
    assertValid(req);

    const { name, email, password } = req.body;
    const safeEmail = normEmail(email);

    const safeName =
      name && String(name).trim().length > 0 ? String(name).trim() : "Player";

    let user = await User.findOne({ email: safeEmail });

    if (user) {
      if (user.emailVerified) {
        return res.status(409).json({ message: "Email already in use" });
      }

      user.name = safeName || user.name;
      user.email = safeEmail;
      user.password = password;
      await user.save();
    } else {
      user = await User.create({ name: safeName, email: safeEmail, password });
    }

    await VerificationCode.deleteMany({ userId: user._id });

    const raw = make5DigitCode();
    const codeHash = await hashToken(raw);

    await VerificationCode.create({
      userId: user._id,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // NOTE: this is still awaited; if you want register to also not timeout,
    // we can apply the same "respond first, email after" strategy here too.
    await sendEmail({
      to: user.email,
      subject: "Verify your email",
      html: `<p>Your verification code is <b>${raw}</b></p>`,
    });

    return res.status(201).json({
      message: "Verification code sent",
      uid: user._id,
      email: user.email,
    });
  } catch (err) {
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
export async function verifyEmail(req, res, next) {
  try {
    assertValid(req);

    const { uid, code } = req.body;

    const row = await VerificationCode.findOne({ userId: uid });
    if (!row) return res.status(400).json({ message: "Code not found or expired" });

    if (row.expiresAt < new Date()) {
      await VerificationCode.deleteMany({ userId: uid });
      return res.status(400).json({ message: "Code expired" });
    }

    const ok = await bcrypt.compare(String(code), row.codeHash);
    if (!ok) return res.status(400).json({ message: "Invalid code" });

    await User.findByIdAndUpdate(uid, { emailVerified: true });
    await VerificationCode.deleteMany({ userId: uid });

    return res.json({ message: "Email verified" });
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

    const user = await User.findOne({ email: safeEmail }).select("+password +refreshToken");
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
        uid: user._id,
        email: user.email,
      });
    }

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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- REFRESH ----------
export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: "Missing refresh token" });

    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.sub).select("+refreshToken");

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

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
  const token = req.cookies?.refreshToken;

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

// ---------- FORGOT PASSWORD (NON-BLOCKING EMAIL) ----------
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

    // ✅ respond immediately
    res.status(200).json({
      message: "Password reset code sent",
      uid: user._id,
      email: user.email,
    });

    // ✅ send email after response (no await)
    sendEmail({
      to: user.email,
      subject: "Reset your password",
      html: `<p>Your password reset code is <b>${raw}</b></p>`,
    }).catch((err) => {
      console.error("❌ Email send failed (forgotPassword):", err?.message || err);
    });
  } catch (err) {
    next(err);
  }
}

// ---------- RESET PASSWORD ----------
export async function resetPassword(req, res, next) {
  try {
    assertValid(req);

    // Your controller expects uid + code + password
    const { uid, code, password } = req.body;

    const row = await PasswordResetCode.findOne({ userId: uid });
    if (!row) return res.status(400).json({ message: "Code not found or expired" });

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

    // Your route validates email + role
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
    const users = await User.find().select("_id name email role");
    return res.json(users);
  } catch (err) {
    next(err);
  }
}
