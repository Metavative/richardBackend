import nodemailer from "nodemailer";
import createError from "http-errors";
import { env } from "../config/env.js";

const EMAIL_DISABLED = String(process.env.EMAIL_DISABLED || "").toLowerCase() === "true";

function assertEmailConfig() {
  if (EMAIL_DISABLED) return;

  const missing = [];
  if (!env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!env.SMTP_PORT) missing.push("SMTP_PORT");
  if (!env.SMTP_USER) missing.push("SMTP_USER");
  if (!env.SMTP_PASS) missing.push("SMTP_PASS");
  if (!env.FROM_EMAIL) missing.push("FROM_EMAIL");

  if (missing.length) {
    throw createError(500, `Email server misconfigured: missing ${missing.join(", ")}`);
  }
}

assertEmailConfig();

const transporter = EMAIL_DISABLED
  ? null
  : nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: Number(env.SMTP_PORT) === 465, // 465 SSL, others STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },

      // ✅ Production stability
      pool: true,
      maxConnections: 3,
      maxMessages: 50,

      // ✅ Prevent hanging on Railway
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,

      // ✅ Some providers require this
      tls: {
        rejectUnauthorized: false,
      },
    });

/**
 * Send an email (throws with clean error message).
 * If EMAIL_DISABLED=true, it will "pretend send" and log instead.
 */
export async function sendEmail({ to, subject, html }) {
  if (!to) throw createError(400, "sendEmail: 'to' is required");
  if (!subject) throw createError(400, "sendEmail: 'subject' is required");
  if (!html) throw createError(400, "sendEmail: 'html' is required");

  if (EMAIL_DISABLED) {
    console.log("� EMAIL_DISABLED=true — skipping email send.");
    console.log({ to, subject });
    return { disabled: true };
  }

  try {
    const info = await transporter.sendMail({
      from: env.FROM_EMAIL,
      to,
      subject,
      html,
    });

    console.log("✅ Email sent:", {
      to,
      subject,
      messageId: info.messageId,
      response: info.response,
    });

    return info;
  } catch (err) {
    console.error("❌ Email send failed:", err?.message || err);

    // Give a clean error to controllers (so you don't see generic "Server Error")
    throw createError(
      502,
      `Email delivery failed: ${err?.message || "SMTP error"}`
    );
  }
}
