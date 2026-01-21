// src/sockets/checkers.socket.js
import {
    getMatch,
    ensurePlayerInMatch,
    getPublicState,
    applyMove,
  } from "../stores/checkersMatch.store.js";
  
  export const CheckersEvents = {
    join: "checkers:join",
    requestState: "checkers:request_state",
    move: "checkers:move",
  
    state: "checkers:state",
    moveApplied: "checkers:move_applied",
    error: "checkers:error",
  };
  
  function ensureAuthed(socket) {
    const uid = socket.userId ? String(socket.userId).trim() : "";
    return uid.length ? uid : null;
  }
  
  function matchRoom(matchId) {
    return `checkers:match:${matchId}`;
  }
  
  export function registerCheckersSockets(io) {
    io.on("connection", (socket) => {
      socket.on(CheckersEvents.join, (payload = {}) => {
        const userId = ensureAuthed(socket) || String(payload?.userId || "").trim();
        const matchId = String(payload?.matchId || "").trim();
  
        if (!userId) {
          socket.emit(CheckersEvents.error, { code: "UNAUTHENTICATED", message: "Missing token", ts: Date.now() });
          return;
        }
        if (!matchId) {
          socket.emit(CheckersEvents.error, { code: "BAD_PAYLOAD", message: "matchId required", ts: Date.now() });
          return;
        }
  
        const match = getMatch(matchId);
        if (!match) {
          socket.emit(CheckersEvents.error, { code: "MATCH_NOT_FOUND", message: "Match not found", ts: Date.now() });
          return;
        }
        if (!ensurePlayerInMatch(match, userId)) {
          socket.emit(CheckersEvents.error, { code: "NOT_A_PLAYER", message: "Not a match player", ts: Date.now() });
          return;
        }
  
        socket.join(matchRoom(matchId));
        socket.emit(CheckersEvents.state, getPublicState(match));
      });
  
      socket.on(CheckersEvents.requestState, (payload = {}) => {
        const userId = ensureAuthed(socket) || String(payload?.userId || "").trim();
        const matchId = String(payload?.matchId || "").trim();
  
        if (!userId) {
          socket.emit(CheckersEvents.error, { code: "UNAUTHENTICATED", message: "Missing token", ts: Date.now() });
          return;
        }
        if (!matchId) {
          socket.emit(CheckersEvents.error, { code: "BAD_PAYLOAD", message: "matchId required", ts: Date.now() });
          return;
        }
  
        const match = getMatch(matchId);
        if (!match) {
          socket.emit(CheckersEvents.error, { code: "MATCH_NOT_FOUND", message: "Match not found", ts: Date.now() });
          return;
        }
        if (!ensurePlayerInMatch(match, userId)) {
          socket.emit(CheckersEvents.error, { code: "NOT_A_PLAYER", message: "Not a match player", ts: Date.now() });
          return;
        }
  
        socket.join(matchRoom(matchId));
        socket.emit(CheckersEvents.state, getPublicState(match));
      });
  
      socket.on(CheckersEvents.move, (payload = {}) => {
        const userId = ensureAuthed(socket) || String(payload?.userId || "").trim();
        const matchId = String(payload?.matchId || "").trim();
  
        if (!userId) {
          socket.emit(CheckersEvents.error, { code: "UNAUTHENTICATED", message: "Missing token", ts: Date.now() });
          return;
        }
        if (!matchId) {
          socket.emit(CheckersEvents.error, { code: "BAD_PAYLOAD", message: "matchId required", ts: Date.now() });
          return;
        }
  
        const match = getMatch(matchId);
        if (!match) {
          socket.emit(CheckersEvents.error, { code: "MATCH_NOT_FOUND", message: "Match not found", ts: Date.now() });
          return;
        }
        if (!ensurePlayerInMatch(match, userId)) {
          socket.emit(CheckersEvents.error, { code: "NOT_A_PLAYER", message: "Not a match player", ts: Date.now() });
          return;
        }
  
        const clientMoveId = payload?.clientMoveId ? String(payload.clientMoveId) : null;
  
        const result = applyMove(match, {
          userId,
          clientMoveId,
          from: payload?.from,
          to: payload?.to,
          isCapture: !!payload?.isCapture,
          captured: Array.isArray(payload?.captured) ? payload.captured : [],
        });
  
        if (!result.ok) {
          socket.emit(CheckersEvents.error, {
            matchId,
            clientMoveId,
            ...(result.error || { code: "UNKNOWN", message: "Move rejected" }),
            ts: Date.now(),
          });
          return;
        }
  
        // Join room if not already
        socket.join(matchRoom(matchId));
  
        // Broadcast authoritative state to everyone (recommended)
        io.to(matchRoom(matchId)).emit(CheckersEvents.state, result.state);
  
        // Also broadcast move_applied (your Flutter supports it)
        if (result.moveApplied) {
          io.to(matchRoom(matchId)).emit(CheckersEvents.moveApplied, result.moveApplied);
        }
      });
    });
  }
  