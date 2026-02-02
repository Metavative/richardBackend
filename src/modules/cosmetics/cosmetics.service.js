import Cosmetic from "../../models/Cosmetic.js";
import UserAchievement from "../../models/UserAchievement.js";
import User from "../../models/User.js";

export async function listCosmetics() {
  const items = await Cosmetic.find({ active: true }).sort({ sort: 1 }).lean();
  return items.map((c) => ({
    id: c.cosmeticId,
    type: c.type,
    name: c.name,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl || "",
    previewUrl: c.previewUrl || "",
    unlockByAchievementId: c.unlockByAchievementId || "",
    style: c.style || {},
  }));
}

export async function getMyCosmetics(userId) {
  const user = await User.findById(userId).select("cosmetics").lean();

  const applied = {
    boardId: user?.cosmetics?.appliedBoardId || "",
    piecesId: user?.cosmetics?.appliedPiecesId || "",
  };

  const completed = await UserAchievement.find({ userId, completed: true })
    .select("achievementId")
    .lean();

  const completedSet = new Set(completed.map((x) => x.achievementId));

  const cosmetics = await Cosmetic.find({ active: true })
    .select("cosmeticId unlockByAchievementId")
    .lean();

  const unlockedIds = cosmetics
    .filter((c) => {
      const req = (c.unlockByAchievementId || "").trim();
      return !req || completedSet.has(req);
    })
    .map((c) => c.cosmeticId);

  return { unlockedIds, applied };
}

export async function applyMyCosmetics(userId, { boardId = "", piecesId = "" }) {
  const { unlockedIds } = await getMyCosmetics(userId);
  const unlocked = new Set(unlockedIds);

  if (boardId && !unlocked.has(boardId)) {
    const err = new Error("Board skin is locked");
    err.status = 403;
    throw err;
  }
  if (piecesId && !unlocked.has(piecesId)) {
    const err = new Error("Piece skin is locked");
    err.status = 403;
    throw err;
  }

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "cosmetics.appliedBoardId": boardId || "",
        "cosmetics.appliedPiecesId": piecesId || "",
      },
    }
  );

  return { boardId: boardId || "", piecesId: piecesId || "" };
}
