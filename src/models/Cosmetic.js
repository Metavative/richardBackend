import mongoose from "mongoose";

const cosmeticSchema = new mongoose.Schema(
  {
    cosmeticId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["board", "pieces"], required: true },

    name: { type: String, required: true },
    description: { type: String, default: "" },

    thumbnailUrl: { type: String, default: "" },
    previewUrl: { type: String, default: "" },

    // empty => unlocked by default
    unlockByAchievementId: { type: String, default: "" },

    style: { type: Object, default: {} },

    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Cosmetic = mongoose.model("Cosmetic", cosmeticSchema);
export default Cosmetic;
