import Cosmetic from "../../models/Cosmetic.js";
import UserAchievement from "../../models/UserAchievement.js";
import User from "../../models/User.js";

function storeType(type) {
  const t = String(type || "").trim().toLowerCase();
  if (t === "theme") return "board";
  if (t === "skin") return "pieces";
  return t;
}

export async function listCosmetics() {
  const items = await Cosmetic.find({ active: true }).sort({ sort: 1 }).lean();
  return items.map((c) => ({
    id: c.cosmeticId,
    type: storeType(c.type),
    name: c.name,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl || "",
    previewUrl: c.previewUrl || "",
    badge: c.badge || "",
    priceCoins: Number(c.priceCoins || 0),
    unlockByAchievementId: c.unlockByAchievementId || "",
    style: c.style || {},
    sort: Number(c.sort || 0),
    active: c.active !== false,
  }));
}

export async function getMyCosmetics(userId) {
  const user = await User.findById(userId).select("cosmetics").lean();

  const applied = {
    boardId: user?.cosmetics?.appliedBoardId || "",
    piecesId: user?.cosmetics?.appliedPiecesId || "",
  };
  const purchased = Array.isArray(user?.cosmetics?.ownedIds)
    ? user.cosmetics.ownedIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  const completed = await UserAchievement.find({ userId, completed: true })
    .select("achievementId")
    .lean();

  const completedSet = new Set(completed.map((x) => x.achievementId));

  const cosmetics = await Cosmetic.find({ active: true })
    .select("cosmeticId unlockByAchievementId priceCoins")
    .lean();

  const unlockedByAchievement = cosmetics
    .filter((c) => {
      const req = (c.unlockByAchievementId || "").trim();
      return !req || completedSet.has(req);
    })
    .map((c) => c.cosmeticId);

  const freeIds = cosmetics
    .filter((c) => Number(c.priceCoins || 0) <= 0)
    .map((c) => c.cosmeticId);

  const ownedIds = Array.from(new Set([...purchased, ...unlockedByAchievement, ...freeIds]));
  const ownedSet = new Set(ownedIds);

  return {
    ownedIds,
    unlockedIds: ownedIds, // backward compatibility for older clients
    applied: {
      boardId: ownedSet.has(applied.boardId) ? applied.boardId : "",
      piecesId: ownedSet.has(applied.piecesId) ? applied.piecesId : "",
    },
  };
}

export async function buyCosmetic(userId, { cosmeticId = "" }) {
  const id = String(cosmeticId || "").trim();
  if (!id) {
    const err = new Error("cosmeticId is required");
    err.status = 400;
    throw err;
  }

  const cosmetic = await Cosmetic.findOne({ cosmeticId: id, active: true })
    .select("cosmeticId priceCoins unlockByAchievementId")
    .lean();

  if (!cosmetic) {
    const err = new Error("Cosmetic not found");
    err.status = 404;
    throw err;
  }

  const mine = await getMyCosmetics(userId);
  if (Array.isArray(mine.ownedIds) && mine.ownedIds.includes(id)) {
    const user = await User.findById(userId).select("economy.coinsBalance").lean();
    return {
      cosmeticId: id,
      owned: true,
      spentCoins: 0,
      coinsBalance: Number(user?.economy?.coinsBalance || 0),
    };
  }

  const price = Math.max(0, Number(cosmetic.priceCoins || 0));
  if (price <= 0) {
    const updated = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { "cosmetics.ownedIds": id } },
      { new: true }
    )
      .select("economy.coinsBalance")
      .lean();

    return {
      cosmeticId: id,
      owned: true,
      spentCoins: 0,
      coinsBalance: Number(updated?.economy?.coinsBalance || 0),
    };
  }

  const updated = await User.findOneAndUpdate(
    { _id: userId, "economy.coinsBalance": { $gte: price } },
    {
      $inc: { "economy.coinsBalance": -price },
      $addToSet: { "cosmetics.ownedIds": id },
    },
    { new: true }
  )
    .select("economy.coinsBalance")
    .lean();

  if (!updated) {
    const err = new Error("Not enough coins");
    err.status = 400;
    throw err;
  }

  return {
    cosmeticId: id,
    owned: true,
    spentCoins: price,
    coinsBalance: Number(updated?.economy?.coinsBalance || 0),
  };
}

export async function applyMyCosmetics(userId, { boardId = "", piecesId = "" }) {
  const { ownedIds } = await getMyCosmetics(userId);
  const owned = new Set(ownedIds);

  if (boardId && !owned.has(boardId)) {
    const err = new Error("Board skin is locked");
    err.status = 403;
    throw err;
  }
  if (piecesId && !owned.has(piecesId)) {
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
