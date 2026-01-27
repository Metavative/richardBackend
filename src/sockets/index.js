// src/sockets/index.js
import { socketAuth } from "./socketAuth.js";
import { bindPresenceSockets } from "./presence.socket.js";
import { bindChallengeSockets } from "./challenge.socket.js";
import { bindCheckersSockets } from "./checkers.socket.js";

export function initSockets(io, { matchmakingService } = {}) {
  // 1) Auth middleware for sockets (aligned with REST token verification)
  // socketAuth is a factory -> must be invoked
  io.use(socketAuth());

  // 2) Bind socket modules
  bindPresenceSockets(io);
  bindChallengeSockets(io, { matchmakingService });
  bindCheckersSockets(io);

  console.log("✅ Sockets initialized: presence + challenges + checkers");
}
