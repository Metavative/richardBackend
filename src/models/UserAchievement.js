import mongoose from "mongoose";

const userAchievementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    achievementId: { type: String, required: true, index: true },

    current: { type: Number, default: 0 },
    target: { type: Number, default: 0 },

    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export const UserAchievement = mongoose.model("UserAchievement", userAchievementSchema);
export default UserAchievement;
