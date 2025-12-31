import mongoose from "mongoose";
const { Schema } = mongoose;

const ChallengeSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

ChallengeSchema.index({ from: 1, to: 1, status: 1, createdAt: -1 });

export default mongoose.models.Challenge ||
  mongoose.model("Challenge", ChallengeSchema);
