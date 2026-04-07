import mongoose from "mongoose";

function normalizeCosmeticType(v) {
  const raw = String(v || "").trim().toLowerCase();
  if (raw === "theme") return "board";
  if (raw === "skin") return "pieces";
  return raw;
}

const cosmeticSchema = new mongoose.Schema(
  {
    cosmeticId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["board", "pieces"], required: true },

    name: { type: String, required: true },
    description: { type: String, default: "" },

    thumbnailUrl: { type: String, default: "" },
    previewUrl: { type: String, default: "" },
    badge: { type: String, default: "" },
    priceCoins: { type: Number, default: 0, min: 0 },

    // empty => unlocked by default
    unlockByAchievementId: { type: String, default: "" },

    style: { type: Object, default: {} },

    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

cosmeticSchema.pre("validate", function (next) {
  try {
    if (this.isModified("type")) {
      this.type = normalizeCosmeticType(this.type);
    }
    next();
  } catch (err) {
    next(err);
  }
});

export const Cosmetic = mongoose.model("Cosmetic", cosmeticSchema);
export default Cosmetic;
