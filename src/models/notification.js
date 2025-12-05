// src/models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true }, // e.g. 'friend_request'
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true });

export const Notification = mongoose.model("Notification", notificationSchema);
