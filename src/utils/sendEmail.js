import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export async function sendEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: env.FROM_EMAIL,
    to,
    subject,
    html,
  });
}
