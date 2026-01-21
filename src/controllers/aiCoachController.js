// src/controllers/aiCoachController.js
import createError from "http-errors";

/**
 * POST /api/ai-coach/advice
 * Body: { prompt, context? }
 */
export async function getAiAdvice(req, res) {
  const { prompt, context } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    const err = createError(400, "prompt is required");
    err.code = "PROMPT_REQUIRED";
    throw err;
  }

  // � NOTE:
  // This is intentionally a stub. Plug your real AI service here.
  // Keep it wrapped so failures never crash the server.
  const advice = {
    message: "Think ahead, control the center, and protect your pieces.",
    confidence: 0.73,
    meta: {
      contextUsed: Boolean(context),
    },
  };

  return res.ok({ advice });
}
