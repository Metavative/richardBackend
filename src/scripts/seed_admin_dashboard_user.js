import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../config/db.js";
import User from "../models/User.js";

const ADMIN_EMAIL = String(process.env.ADMIN_DASH_EMAIL || "admin@latrel.app")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = String(
  process.env.ADMIN_DASH_PASSWORD || "Admin@12345"
).trim();
const ADMIN_USERNAME = String(process.env.ADMIN_DASH_USERNAME || "latrel_admin")
  .trim()
  .toLowerCase();
const ADMIN_NAME = String(process.env.ADMIN_DASH_NAME || "LA-TREL Admin").trim();
const ADMIN_PROFILE_PIC = String(
  process.env.ADMIN_DASH_PROFILE_PIC ||
    "https://api.dicebear.com/9.x/bottts/png?seed=latrel-admin"
).trim();

async function main() {
  try {
    await connectDB();

    let user = await User.findOne({ email: ADMIN_EMAIL }).select("+password");
    if (!user) {
      user = new User({
        name: ADMIN_NAME,
        username: ADMIN_USERNAME,
        nickname: "ADMIN",
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        emailVerified: true,
        role: "admin",
        profile_picture: {
          key: "admin-seed",
          url: ADMIN_PROFILE_PIC
        }
      });
    } else {
      user.name = ADMIN_NAME;
      user.username = ADMIN_USERNAME;
      user.nickname = "ADMIN";
      user.password = ADMIN_PASSWORD;
      user.emailVerified = true;
      user.role = "admin";
      user.profile_picture = {
        key: user.profile_picture?.key || "admin-seed",
        url: ADMIN_PROFILE_PIC
      };
    }

    await user.save();

    console.log("Admin dashboard user ready");
    console.log(`email=${ADMIN_EMAIL}`);
    console.log(`password=${ADMIN_PASSWORD}`);
    console.log(`userId=${user._id.toString()}`);
  } catch (err) {
    console.error("Failed to seed admin dashboard user:", err);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

main();

