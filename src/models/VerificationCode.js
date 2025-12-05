import mongoose from "mongoose";

const verificationCodeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 }, // throttle wrong attempts
  },
  { timestamps: true }
);

export const VerificationCode = mongoose.model(
  "VerificationCode",
  verificationCodeSchema
);
