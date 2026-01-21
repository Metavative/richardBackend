// src/sockets/index.js
import { attachSocketAuth } from "./socketAuth.js";
import { registerPresenceSockets } from "./presence.socket.js";
import { registerChallengeSockets } from "./challenge.socket.js";
import { registerCheckersSockets } from "./checkers.socket.js";

/**
 * Register all realtime socket modules.
 */
export function initSockets(io) {
  // Auth middleware (non-blocking)
  attachSocketAuth(io);

  // Presence (online players)
  registerPresenceSockets(io);

  // Challenges (challenge online players)
  registerChallengeSockets(io);

  // Checkers realtime gameplay (match rooms + state + moves)
  registerCheckersSockets(io);
}
