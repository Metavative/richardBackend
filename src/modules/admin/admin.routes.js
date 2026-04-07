import express from "express";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { upload } from "../../middleware/upload.js";
import {
  createCosmeticAdmin,
  deleteCosmeticAdmin,
  deleteUserAdmin,
  listCosmeticsAdmin,
  listUsersAdmin,
  uploadBoardImageAndCreateAdmin,
  updateCosmeticAdmin,
  updateUserAdmin,
} from "./admin.controller.js";

const router = express.Router();

function boardUploadMiddleware(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}

router.use(requireAdmin);

router.get("/users", asyncHandler(listUsersAdmin));
router.patch("/users/:userId", asyncHandler(updateUserAdmin));
router.delete("/users/:userId", asyncHandler(deleteUserAdmin));

router.get("/cosmetics", asyncHandler(listCosmeticsAdmin));
router.post(
  "/cosmetics/upload-board",
  boardUploadMiddleware,
  asyncHandler(uploadBoardImageAndCreateAdmin)
);
router.post("/cosmetics", asyncHandler(createCosmeticAdmin));
router.put("/cosmetics/:cosmeticId", asyncHandler(updateCosmeticAdmin));
router.delete("/cosmetics/:cosmeticId", asyncHandler(deleteCosmeticAdmin));

export default router;
