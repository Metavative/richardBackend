// src/controllers/userController.js
import createError from "http-errors";
import User from "../models/User.js";

/**
 * Edit user profile
 * PUT /api/users/edit
 */
export async function editProfile(req, res) {
  const userId = req.userId;

  const updates = {};
  if (req.body?.name) updates.name = String(req.body.name).trim();
  if (req.body?.bio) updates.bio = String(req.body.bio).trim();

  if (req.file) {
    updates.profile_picture = {
      key: req.file.filename,
      url: `/uploads/${req.file.filename}`
    };
  }

  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
    .select("_id name email role profile_picture")
    .lean();

  if (!user) {
    throw createError(404, "User not found");
  }

  return res.ok({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile_picture: user.profile_picture?.url ?? null,
    },
  });
}