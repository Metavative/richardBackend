import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL,

  MONGODB_URI: process.env.MONGODB_URI,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || "15m",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || "7d",

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  FROM_EMAIL: process.env.FROM_EMAIL,

  TOKEN_SALT_ROUNDS: Number(process.env.TOKEN_SALT_ROUNDS || 12),

  VERIFY_EMAIL_URL: process.env.VERIFY_EMAIL_URL,
  RESET_PASSWORD_URL: process.env.RESET_PASSWORD_URL,

  PORT: process.env.PORT,
  CLIENT_URL: process.env.CLIENT_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
