import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const requireAuth = (req, res, next) => {
  // Prefer Authorization header, but allow cookie fallback for web
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.accessToken;

  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (cookieToken) {
    token = cookieToken;
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token" });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    // You use `sub` for userId in token payload
    const userId = decoded?.sub?.toString();
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid token payload" });
    }

    // Keep the full decoded token for flexibility
    req.user = decoded;

    // Add normalized fields commonly used in controllers
    req.userId = userId;

    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (err?.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }

    console.error("JWT verify error:", err);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
