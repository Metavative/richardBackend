import dotenv from "dotenv";
dotenv.config();

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",

  // ✅ Railway sets PORT as a number. Locally fallback to 4000.
  PORT: toInt(process.env.PORT, 4000),

  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",

  MONGODB_URI: process.env.MONGODB_URI,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || "15m",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || "7d",

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: toInt(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  FROM_EMAIL: process.env.FROM_EMAIL,

  TOKEN_SALT_ROUNDS: toInt(process.env.TOKEN_SALT_ROUNDS, 12),

  VERIFY_EMAIL_URL: process.env.VERIFY_EMAIL_URL,
  RESET_PASSWORD_URL: process.env.RESET_PASSWORD_URL,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,

  PUSH_FRIENDS_ONLINE_MIN: toInt(process.env.PUSH_FRIENDS_ONLINE_MIN, 5),
  PUSH_INACTIVE_DAYS: toInt(process.env.PUSH_INACTIVE_DAYS, 3),
  PUSH_FRIENDS_COOLDOWN_MIN: toInt(process.env.PUSH_FRIENDS_COOLDOWN_MIN, 360),
  PUSH_INACTIVE_COOLDOWN_HOURS: toInt(
    process.env.PUSH_INACTIVE_COOLDOWN_HOURS,
    24
  ),
  PUSH_FRIENDS_SCAN_MS: toInt(process.env.PUSH_FRIENDS_SCAN_MS, 300000),
  PUSH_INACTIVE_SCAN_MS: toInt(process.env.PUSH_INACTIVE_SCAN_MS, 3600000),
};
