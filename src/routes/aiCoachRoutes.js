import express from "express";
import { aiCoach } from "../controllers/aiCoachController.js";

const router = express.Router();

// Test endpoint to verify route is working
router.get("/test", (req, res) => {
  console.log("✅ /ai/test endpoint hit");
  res.json({ 
    status: "success",
    message: "✅ AI Coach route is working!",
    endpoint: "POST /ai/coach",
    timestamp: new Date().toISOString(),
    sampleRequest: {
      board: "8x8 array of piece codes (W, S, T, D for Light, w, s, t, d for Dark, empty string for empty)",
      turn: "0 for Light, 1 for Dark",
      version: "basic, standard, or advanced",
      gameMode: "standard",
      moveHistory: "array of previous moves (optional)"
    }
  });
});

// Main AI Coach endpoint
router.post("/coach", aiCoach);

export default router;