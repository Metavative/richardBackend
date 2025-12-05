// import express from "express";
// import { requireAuth } from "../middleware/requireAuth.js";
// import { upload } from "../middleware/upload.js";
// import { editProfile } from "../controllers/userController.js";

// const router = express.Router();

// // Edit profile
// router.put("/edit", requireAuth, upload.single("profilePic"), editProfile);

// export default router;

import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { upload } from "../middleware/upload.js";
import { editProfile } from "../controllers/userController.js";

const router = express.Router();

// Edit profile
router.put(
  "/edit",
  requireAuth,
  (req, res, next) => {
    upload.single("profilePic")(req, res, (err) => {
      if (err) {
        console.error("Upload error:", err);
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  editProfile
);

export default router;


