import mongoose from "mongoose";

const achievementSchema = new mongoose.Schema(
  {
    achievementId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },

    // maps to User.gamingStats.<metricKey>
    // wins | losses | draws | totalGames | winRate | streak | maxStreak | mmr
    metricKey: { type: String, required: true },
    target: { type: Number, required: true },

    iconUrl: { type: String, default: "" },
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Achievement = mongoose.model("Achievement", achievementSchema);
export default Achievement;
