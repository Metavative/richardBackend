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
import FriendRequest from "../models/friend.js"; // FIXED: Import FriendRequest here

// --- helpers ---
const make5DigitCode = () => String(crypto.randomInt(10000, 100000));
const hashToken = async (token) =>
  bcrypt.hash(token, Number(process.env.TOKEN_SALT_ROUNDS || 12));

function sendValidationErrors(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw createError(400, { errors: errors.array() });
}

// 🔔 Notification helper function
const logUserActivity = (action, user, additionalInfo = "") => {
  const timestamp = new Date().toLocaleString();
  console.log(`👤 USER ${action}: ${user.name} (${user.email})`);
  console.log(`   User ID: ${user._id}, Time: ${timestamp}`);
  if (additionalInfo) {
    console.log(`   ${additionalInfo}`);
  }
};

export const register = async (req, res, next) => {
  try {
    // 1. Validate request first (email/password format etc.)
    sendValidationErrors(req);
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      if (user.emailVerified) {
        // DON'T do: throw next(...)
        throw createError(409, "Email already in use");
      } else {
        // Update unverified user
        user.name = name || user.name;
        if (password) user.password = password;
        await user.save();
        await VerificationCode.deleteMany({ userId: user._id });

        const raw = make5DigitCode();
        const codeHash = await hashToken(raw);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await VerificationCode.create({
          userId: user._id,
          codeHash,
          expiresAt,
        });

        await sendEmail({
          to: user.email,
          subject: "Your verification code",
          html: `<p>Hi ${user.name},</p><p>Your verification code is <b style="font-size:20px;letter-spacing:3px;">${raw}</b>. It expires in 10 minutes.</p>`,
        });

        return res.json({
          message: "Verification code resent. Please check your email.",
          uid: user._id,
        });
      }
    }

    // New user path
    user = await User.create({ name, email, password });

    // 🔔 ADDED: User registration notification
    logUserActivity("REGISTERED", user, "Verification email sent");

    await VerificationCode.deleteMany({ userId: user._id });
    const raw = make5DigitCode();
    const codeHash = await hashToken(raw);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await VerificationCode.create({
      userId: user._id,
      codeHash,
      expiresAt,
    });

    await sendEmail({
      to: user.email,
      subject: "Your verification code",
      html: `<p>Hi ${user.name},</p><p>Your verification code is <b style="font-size:20px;letter-spacing:3px;">${raw}</b>. It expires in 10 minutes.</p>`,
    });

    res.status(201).json({
      message: "Registered successfully. Please check your email to verify.",
      uid: user._id,
    });
  } catch (err) {
    // Handle the error correctly
    console.error("Error in register:", err);
    next(err); // pass the error to the error handler middleware
  }
};

export const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) throw createError(400, "Email is required");

  const user = await User.findOne({ email });
  if (!user)
    return res.json({ message: "If that email exists, a code has been sent." });
  if (user.emailVerified) return res.json({ message: "Email already verified." });

  await VerificationCode.deleteMany({ userId: user._id });
  const raw = String(crypto.randomInt(10000, 100000));
  const codeHash = await bcrypt.hash(
    raw,
    Number(process.env.TOKEN_SALT_ROUNDS || 12)
  );
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await VerificationCode.create({
    userId: user._id,
    codeHash,
    expiresAt,
  });

  await sendEmail({
    to: user.email,
    subject: "Your verification code",
    html: `<p>Your verification code is <b style="font-size:20px;letter-spacing:3px;">${raw}</b>. It expires in 10 minutes.</p>`,
  });

  // For dev convenience, you can temporarily expose the code:
  if (process.env.NODE_ENV !== "production") {
    console.log("DEV resend verification code:", raw);
    return res.json({
      message: "If that email exists, a code has been sent.",
      uid: user._id,
      devCode: raw,
    });
  }

  res.json({
    message: "If that email exists, a code has been sent.",
    uid: user._id,
  });
};

// GET /auth/verify-email?token=..&uid=..
export const verifyEmail = async (req, res) => {
  const { uid, code } = req.body; // POST body
  if (!uid || !code) throw createError(400, "Code and uid are required");

  const record = await VerificationCode.findOne({ userId: uid });
  if (!record) throw createError(400, "Invalid or expired code");
  if (record.attempts >= 5) {
    await VerificationCode.deleteOne({ _id: record._id });
    throw createError(429, "Too many attempts. Request a new code.");
  }

  const ok = await bcrypt.compare(code, record.codeHash);
  if (!ok || record.expiresAt < new Date()) {
    await VerificationCode.updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } }
    );
    throw createError(400, "Invalid or expired code");
  }

  await User.findByIdAndUpdate(uid, { emailVerified: true });
  
  // 🔔 ADDED: Email verification notification
  const user = await User.findById(uid);
  if (user) {
    logUserActivity("EMAIL VERIFIED", user, "Account fully activated");
  }

  await VerificationCode.deleteOne({ _id: record._id });
  res.json({ message: "Email verified." });
};

// POST /auth/login
export const login = async (req, res) => {
  // sendValidationErrors(req);
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password +refreshToken");
  if (!user) throw createError(401, "Invalid credentials");

  const ok = await user.comparePassword(password);
  if (!ok) throw createError(401, "Invalid credentials");

  if (!user.emailVerified)
    throw createError(403, "Please verify your email before logging in.");

  // 🔔 ADDED: Enhanced login notification
  console.log(`🔐 USER LOGIN SUCCESS: ${user.name} (${user.email})`);
  console.log(`   👤 User ID: ${user._id}`);
  console.log(`   ⏰ Time: ${new Date().toLocaleString()}`);
  console.log(`   🎯 Role: ${user.role}`);
  console.log(`   ✅ Email Verified: ${user.emailVerified}`);
  console.log(`   📍 Status: ACTIVE`);

  const accessToken = generateAccessToken({
    sub: user._id.toString(),
    email: user.email,
  });
  const refreshToken = generateRefreshToken({ sub: user._id.toString() });

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
};

// POST /auth/refresh
export const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw createError(401, "Missing refresh token");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw createError(401, "Invalid refresh token");
  }

  const user = await User.findById(payload.sub).select("+refreshToken");
  if (!user || user.refreshToken !== token)
    throw createError(401, "Invalid refresh token");

  const accessToken = generateAccessToken({
    sub: user._id.toString(),
    email: user.email,
  });
  res.json({ accessToken });
};

// POST /auth/logout
export const logout = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.sub, {
        $unset: { refreshToken: 1 },
      });
      
      // 🔔 ADDED: Logout notification
      const user = await User.findById(payload.sub);
      if (user) {
        console.log(`🚪 USER LOGOUT: ${user.name} (${user.email})`);
        console.log(`   ⏰ Time: ${new Date().toLocaleString()}`);
      }
    } catch {}
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  res.json({ message: "Logged out" });
};

// POST /auth/forgot-password
export const forgotPassword = async (req, res) => {
  // sendValidationErrors(req);
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user)
    return res.json({ message: "If that email exists, a code has been sent." });

  await PasswordResetCode.deleteMany({ userId: user._id });
  const rawCode = make5DigitCode();
  const codeHash = await hashToken(rawCode);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await PasswordResetCode.create({
    userId: user._id,
    codeHash,
    expiresAt,
  });

  await sendEmail({
    to: user.email,
    subject: "Your password reset code",
    html: `<p>Your reset code is <b style="font-size:20px;letter-spacing:3px;">${rawCode}</b>. It expires in 10 minutes.</p>`,
  });

  // 🔔 ADDED: Password reset request notification
  console.log(`🔑 PASSWORD RESET REQUEST: ${user.email}`);
  console.log(`   👤 User: ${user.name}`);
  console.log(`   ⏰ Time: ${new Date().toLocaleString()}`);

  res.json({
    message: "If that email exists, a code has been sent.",
    uid: user._id,
  });
};

// POST /auth/reset-password
export const resetPassword = async (req, res) => {
  // sendValidationErrors(req);
  const { uid, code, password } = req.body;
  if (!uid || !code || !password)
    throw createError(400, "uid, code, password required");

  const record = await PasswordResetCode.findOne({ userId: uid });
  if (!record) throw createError(400, "Invalid or expired code");
  if (record.attempts >= 5) {
    await PasswordResetCode.deleteOne({ _id: record._id });
    throw createError(429, "Too many attempts. Request a new code.");
  }

  const ok = await bcrypt.compare(code, record.codeHash);
  if (!ok || record.expiresAt < new Date()) {
    await PasswordResetCode.updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } }
    );
    throw createError(400, "Invalid or expired code");
  }

  const user = await User.findById(uid).select("+password");
  user.password = password;
  await user.save();

  // 🔔 ADDED: Password reset success notification
  console.log(`✅ PASSWORD RESET SUCCESS: ${user.email}`);
  console.log(`   👤 User: ${user.name}`);
  console.log(`   ⏰ Time: ${new Date().toLocaleString()}`);

  await PasswordResetCode.deleteOne({ _id: record._id });
  res.json({ message: "Password has been reset. You can now log in." });
};

export const selectRole = async (req, res) => {
  const { uid, role } = req.body;
  if (!uid || !role) throw createError(400, "uid and role are required");
  if (!["sourcer", "investor"].includes(role))
    throw createError(400, "Invalid role");

  const user = await User.findById(uid);
  if (!user) throw createError(404, "User not found");
  if (!user.emailVerified) throw createError(403, "Verify email first");

  user.role = role;
  await user.save({ validateBeforeSave: false });

  // 🔔 ADDED: Role selection notification
  console.log(`🎯 ROLE SELECTED: ${user.name} (${user.email})`);
  console.log(`   🎭 New Role: ${role}`);
  console.log(`   ⏰ Time: ${new Date().toLocaleString()}`);

  res.json({ message: "Role selected", role: user.role });
};

export const fetchUsers = async (req, res) => {
  const users = await User.find();
  res.status(200).json(users);
};

/**
 * ==========================
 * SEND FRIEND REQUEST
 * ==========================
 */
export async function sendRequest(req, res, io, presence) {
  try {
    const from = req.userId;
    const { to } = req.body;
    console.log("📤 Sending request:", { from, to });

    if (!to) {
      console.log("❌ No recipient provided");
      return res.status(400).json({ message: "Recipient (to) is required" });
    }

    if (from === to) {
      console.log("❌ Tried to send to self");
      return res
        .status(400)
        .json({ message: "You cannot send a request to yourself" });
    }

    const sender = await User.findById(from);
    if (sender?.friends?.includes(to)) {
      console.log("❌ Already friends");
      return res.status(400).json({ message: "Already friends" });
    }

    const exists = await FriendRequest.findOne({
      from,
      to,
      status: "pending",
    });
    if (exists) {
      console.log("❌ Request already pending");
      return res.status(400).json({ message: "Friend request already pending" });
    }

    const fr = await FriendRequest.create({ from, to });
    console.log("✅ Friend request created:", fr._id);

    const toSocket = presence.get(to?.toString());
    if (toSocket) io.to(toSocket).emit("friend:request:new", { from, request: fr });

    res.json({ success: true, fr });
  } catch (error) {
    console.error("❌ sendRequest error:", error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * ==========================
 * RESPOND TO FRIEND REQUEST
 * ==========================
 */
export async function respond(req, res, io, presence) {
  try {
    const { requestId, accept } = req.body;
    const fr = await FriendRequest.findById(requestId);
    if (!fr) return res.status(404).json({ message: "Request not found" });

    // Update request status
    fr.status = accept ? "accepted" : "rejected";
    await fr.save();

    // If accepted, add to both users' friend lists
    if (accept) {
      await User.findByIdAndUpdate(fr.from, {
        $addToSet: { friends: fr.to },
      });
      await User.findByIdAndUpdate(fr.to, {
        $addToSet: { friends: fr.from },
      });

      // 🔔 ADDED: Friend request accepted notification
      const fromUser = await User.findById(fr.from);
      const toUser = await User.findById(fr.to);
      console.log(`🤝 FRIEND REQUEST ACCEPTED: ${fromUser?.name} and ${toUser?.name} are now friends`);
      console.log(`   ⏰ Time: ${new Date().toLocaleString()}`);
    }

    // ⚡ Real-time sync: notify both users
    const fromSocket = presence.get(fr.from?.toString());
    const toSocket = presence.get(fr.to?.toString());
    if (fromSocket) io.to(fromSocket).emit("friend:request:updated", fr);
    if (toSocket) io.to(toSocket).emit("friend:request:updated", fr);

    res.json({ success: true, fr });
  } catch (err) {
    console.error("❌ respond error:", err);
    res.status(500).json({ message: err.message });
  }
}

/**
 * ==========================
 * SEARCH FRIENDS
 * ==========================
 */
export async function searchFriends(req, res) {
  try {
    const userId = req.userId;
    const { query } = req.query;

    // Get current user's friends
    const currentUser = await User.findById(userId).populate(
      "friends",
      "profile.nickname profile.avatar stats.userIdTag profile.onlineStatus"
    );
    const friendIds = currentUser?.friends?.map((f) => f._id.toString()) || [];

    // Build search filter
    const searchFilter = query
      ? {
          $or: [
            { "profile.nickname": { $regex: query, $options: "i" } },
            { "stats.userIdTag": { $regex: query, $options: "i" } },
          ],
        }
      : {};

    // Find matching users
    const users = await User.find(searchFilter)
      .select(
        "profile.nickname profile.avatar stats.userIdTag profile.onlineStatus"
      )
      .lean();

    // Find all pending requests involving this user
    const requests = await FriendRequest.find({
      $or: [{ from: userId }, { to: userId }],
      status: "pending",
    }).lean();

    // Build response
    const result = users.map((u) => {
      const uid = u._id.toString();
      let status = "none";
      let requestId = null;

      if (friendIds.includes(uid)) {
        status = "friend";
      } else {
        const sentByMe = requests.find(
          (r) => r.from.toString() === userId && r.to.toString() === uid
        );
        const sentToMe = requests.find(
          (r) => r.to.toString() === userId && r.from.toString() === uid
        );

        if (sentByMe) {
          status = "pending"; // ✅ I sent request
          requestId = sentByMe._id;
        } else if (sentToMe) {
          status = "incoming"; // ✅ They sent me request
          requestId = sentToMe._id;
        }
      }

      return {
        _id: uid,
        nickname: u?.profile?.nickname || "Unknown User",
        avatar: u?.profile?.avatar || "",
        userIdTag: u?.stats?.userIdTag || "",
        onlineStatus: u?.profile?.onlineStatus || false,
        status,
        requestId,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("❌ searchFriends error:", error);
    res.status(500).json({ message: error.message });
  }
}