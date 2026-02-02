// src/middleware/auth.middleware.js
// Single, stable auth middleware for the entire codebase.
// This wraps the existing requireAuth middleware so all modules
// can import from ONE place.

import { requireAuth } from "./requireAuth.js";

// Re-export under a consistent name
export const authMiddleware = requireAuth;
