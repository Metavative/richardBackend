import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (!decoded.sub) return res.status(401).json({ message: "Unauthorized: Invalid token payload" });
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ message: "Token expired" });
    if (err.name === "JsonWebTokenError") return res.status(401).json({ message: "Invalid token" });
    console.error("JWT error:", err);
    return res.status(500).json({ message: "Server error verifying token" });
  }
};
