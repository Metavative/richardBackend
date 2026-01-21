// src/stores/checkersMatch.store.js

/**
 * In-memory checkers match state.
 * Server is authoritative.
 */

function now() {
    return Date.now();
  }
  
  function makeMatchId() {
    return `ck_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  
  const matches = new Map(); // matchId -> state
  
  // Same starting board as your Flutter (advanced has blockers)
  function createInitialBoard({ blockersEnabled }) {
    if (blockersEnabled) {
      return [
        ["s", "s", "t", "w", "w", "t", "s", "s"],
        ["d", "d", "b", "d", "d", "b", "d", "d"],
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        ["D", "D", "B", "D", "D", "B", "D", "D"],
        ["S", "S", "T", "W", "W", "T", "S", "S"],
      ];
    }
  
    return [
      ["s", "s", "t", "w", "w", "t", "s", "s"],
      ["d", "d", "d", "d", "d", "d", "d", "d"],
      Array(8).fill(null),
      Array(8).fill(null),
      Array(8).fill(null),
      Array(8).fill(null),
      ["D", "D", "D", "D", "D", "D", "D", "D"],
      ["S", "S", "T", "W", "W", "T", "S", "S"],
    ];
  }
  
  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }
  
  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }
  
  function isCorner(r, c) {
    return (r === 0 || r === 7) && (c === 0 || c === 7);
  }
  
  function isP1Piece(piece) {
    return piece === piece.toUpperCase();
  }
  
  function isBlocker(piece, blockersEnabled) {
    return blockersEnabled && piece && piece.toUpperCase() === "B";
  }
  
  function isAttacker(piece) {
    const t = piece.toUpperCase();
    return t === "S" || t === "T" || t === "W";
  }
  
  function isDefender(piece) {
    return piece.toUpperCase() === "D";
  }
  
  const ORTH = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const DIAG = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  
  function dirsMove(type) {
    if (type === "D") return ORTH;
    if (type === "S") return ORTH;
    if (type === "T") return DIAG;
    if (type === "W") return ORTH.concat(DIAG);
    return [];
  }
  
  function dirsCap(type) {
    if (type === "S") return ORTH;
    if (type === "T") return DIAG;
    if (type === "W") return ORTH.concat(DIAG);
    return [];
  }
  
  /**
   * Blocker moves (no capture):
   * - Slide 1..3 any dir with clear path
   * - Knight-ish offsets (2,1) and (3,1), jumps allowed
   */
  function isValidBlockerMove(board, fr, fc, tr, tc) {
    if (board[tr][tc] != null) return false;
  
    const dr = tr - fr;
    const dc = tc - fc;
  
    // Slide 1..3 any direction
    const slideDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  
    for (const [sr, sc] of slideDirs) {
      for (let step = 1; step <= 3; step++) {
        if (dr === sr * step && dc === sc * step) {
          // path must be clear
          for (let k = 1; k <= step; k++) {
            const rr = fr + sr * k;
            const cc = fc + sc * k;
            if (!inBounds(rr, cc)) return false;
            if (board[rr][cc] != null) return false;
          }
          return true;
        }
      }
    }
  
    // Knight-ish offsets
    const knightOffsets = new Set([
      "-2,-1","-2,1","-1,-2","-1,2","1,-2","1,2","2,-1","2,1",
      "-3,-1","-3,1","-1,-3","-1,3","1,-3","1,3","3,-1","3,1",
    ]);
  
    return knightOffsets.has(`${dr},${dc}`);
  }
  
  /**
   * Validate a single-step immediate capture (matches your Flutter logic).
   * Returns { ok, capturedPos, cornerCaptureLandingOnCaptured }
   */
  function validateImmediateCapture({
    board,
    blockersEnabled,
    fr,
    fc,
    tr,
    tc,
    moverIsP1,
  }) {
    const piece = board[fr][fc];
    if (!piece) return { ok: false };
  
    const type = piece.toUpperCase();
    const dirs = dirsCap(type);
    if (!dirs.length) return { ok: false };
  
    // Find a direction where target is either:
    // - landing beyond captured piece (normal capture)
    // - landing on corner captured piece (corner capture)
    for (const [dr, dc] of dirs) {
      let mr = fr + dr;
      let mc = fc + dc;
  
      // skip empties in direction
      while (inBounds(mr, mc) && board[mr][mc] == null) {
        mr += dr;
        mc += dc;
      }
  
      if (!inBounds(mr, mc)) continue;
      const midPiece = board[mr][mc];
      if (!midPiece) continue;
      if (isBlocker(midPiece, blockersEnabled)) continue;
  
      const midIsP1 = isP1Piece(midPiece);
      if (midIsP1 === moverIsP1) continue; // must be opponent
  
      // corner capture: landing directly on captured corner square
      if (isCorner(mr, mc) && tr === mr && tc === mc) {
        return {
          ok: true,
          capturedPos: { row: mr, col: mc },
          cornerCaptureLandingOnCaptured: true,
        };
      }
  
      // normal capture: land one step beyond
      const lr = mr + dr;
      const lc = mc + dc;
      if (!inBounds(lr, lc)) continue;
      if (board[lr][lc] != null) continue;
  
      if (tr === lr && tc === lc) {
        return {
          ok: true,
          capturedPos: { row: mr, col: mc },
          cornerCaptureLandingOnCaptured: false,
        };
      }
    }
  
    return { ok: false };
  }
  
  function validateNonCaptureMove({ board, blockersEnabled, fr, fc, tr, tc }) {
    const piece = board[fr][fc];
    if (!piece) return { ok: false };
    if (!inBounds(tr, tc)) return { ok: false };
    if (board[tr][tc] != null) return { ok: false };
  
    // Blocker
    if (isBlocker(piece, blockersEnabled)) {
      return { ok: isValidBlockerMove(board, fr, fc, tr, tc) };
    }
  
    const type = piece.toUpperCase();
  
    // Defender: 1 orth step only
    if (type === "D") {
      const dr = Math.abs(tr - fr);
      const dc = Math.abs(tc - fc);
      return { ok: (dr + dc === 1) };
    }
  
    // Attackers slide along allowed dirs until blocked
    const dirs = dirsMove(type);
    for (const [dr, dc] of dirs) {
      let rr = fr + dr;
      let cc = fc + dc;
      while (inBounds(rr, cc) && board[rr][cc] == null) {
        if (rr === tr && cc === tc) return { ok: true };
        rr += dr;
        cc += dc;
      }
    }
  
    return { ok: false };
  }
  
  function countAttackers(board, wantP1, blockersEnabled) {
    let count = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        if (isBlocker(p, blockersEnabled)) continue;
        if (isP1Piece(p) !== wantP1) continue;
        if (isAttacker(p)) count++;
      }
    }
    return count;
  }
  
  function computeWinner(board, blockersEnabled) {
    const a1 = countAttackers(board, true, blockersEnabled);
    const a2 = countAttackers(board, false, blockersEnabled);
  
    if (a1 === 0 && a2 === 0) return { gameEnded: true, winner: "draw" };
    if (a1 === 0) return { gameEnded: true, winner: "playerTwo" };
    if (a2 === 0) return { gameEnded: true, winner: "playerOne" };
    return { gameEnded: false, winner: null };
  }
  
  function immediateCaptureExists({ board, blockersEnabled, r, c }) {
    const piece = board[r][c];
    if (!piece) return false;
    if (isBlocker(piece, blockersEnabled)) return false;
    const moverIsP1 = isP1Piece(piece);
    const type = piece.toUpperCase();
    const dirs = dirsCap(type);
    if (!dirs.length) return false;
  
    for (const [dr, dc] of dirs) {
      let mr = r + dr;
      let mc = c + dc;
  
      while (inBounds(mr, mc) && board[mr][mc] == null) {
        mr += dr;
        mc += dc;
      }
  
      if (!inBounds(mr, mc)) continue;
      const midPiece = board[mr][mc];
      if (!midPiece) continue;
      if (isBlocker(midPiece, blockersEnabled)) continue;
  
      if (isP1Piece(midPiece) === moverIsP1) continue;
  
      // corner capture exists
      if (isCorner(mr, mc)) return true;
  
      const lr = mr + dr;
      const lc = mc + dc;
      if (!inBounds(lr, lc)) continue;
      if (board[lr][lc] == null) return true;
    }
  
    return false;
  }
  
  export function createMatch({
    playerOneId,
    playerTwoId,
    blockersEnabled = true,
    boardDifficultyKey = "advanced",
    aiDifficultyKey = "easy",
  }) {
    const matchId = makeMatchId();
  
    const state = {
      matchId,
      playerOneId,
      playerTwoId,
      blockersEnabled: !!blockersEnabled,
      boardDifficultyKey,
      aiDifficultyKey,
  
      pieces: createInitialBoard({ blockersEnabled: !!blockersEnabled }),
      isPlayerOneTurn: Math.random() < 0.5,
  
      // capture tracking
      playerOneCaptured: [],
      playerTwoCaptured: [],
  
      // chain info (server authoritative)
      chainActive: false,
      chainAt: null, // {row,col}
  
      // end state
      gameEnded: false,
      winner: null,
  
      // dedupe
      seenClientMoveIds: new Set(),
  
      createdAt: now(),
      updatedAt: now(),
  
      // NOTE: For Flutter later: skip showing promotion UI in online games
      promotionLocked: true,
    };
  
    matches.set(matchId, state);
    return state;
  }
  
  export function getMatch(matchId) {
    return matches.get(matchId) || null;
  }
  
  export function ensurePlayerInMatch(match, userId) {
    if (!match) return false;
    return match.playerOneId === userId || match.playerTwoId === userId;
  }
  
  export function getPublicState(match) {
    return {
      matchId: match.matchId,
      playerOneId: match.playerOneId,
      playerTwoId: match.playerTwoId,
      blockersEnabled: match.blockersEnabled,
      boardDifficultyKey: match.boardDifficultyKey,
      aiDifficultyKey: match.aiDifficultyKey,
  
      pieces: match.pieces,
      isPlayerOneTurn: match.isPlayerOneTurn,
  
      playerOneCaptured: match.playerOneCaptured,
      playerTwoCaptured: match.playerTwoCaptured,
  
      chainActive: match.chainActive,
      chainAt: match.chainAt,
  
      gameEnded: match.gameEnded,
      winner: match.winner,
  
      promotionLocked: match.promotionLocked,
  
      ts: now(),
    };
  }
  
  /**
   * Apply a move (server-authoritative)
   * Returns { ok, error?, state?, moveApplied? }
   */
  export function applyMove(match, {
    userId,
    clientMoveId,
    from,
    to,
    isCapture,
    captured,
  }) {
    if (!match) return { ok: false, error: { code: "MATCH_NOT_FOUND", message: "Match not found" } };
    if (match.gameEnded) return { ok: false, error: { code: "GAME_ENDED", message: "Game ended" } };
  
    // Idempotency
    if (clientMoveId && match.seenClientMoveIds.has(clientMoveId)) {
      return { ok: true, state: getPublicState(match), moveApplied: null, deduped: true };
    }
  
    const fr = Number(from?.row);
    const fc = Number(from?.col);
    const tr = Number(to?.row);
    const tc = Number(to?.col);
  
    if (![fr, fc, tr, tc].every((n) => Number.isInteger(n))) {
      return { ok: false, error: { code: "BAD_PAYLOAD", message: "Invalid coordinates" } };
    }
    if (!inBounds(fr, fc) || !inBounds(tr, tc)) {
      return { ok: false, error: { code: "OUT_OF_BOUNDS", message: "Move out of bounds" } };
    }
  
    const piece = match.pieces[fr][fc];
    if (!piece) return { ok: false, error: { code: "PIECE_NOT_FOUND", message: "No piece at from" } };
  
    // Ownership check (by side)
    const moverIsP1 = (match.playerOneId === userId);
    const moverIsP2 = (match.playerTwoId === userId);
    if (!moverIsP1 && !moverIsP2) {
      return { ok: false, error: { code: "NOT_A_PLAYER", message: "Not a player in this match" } };
    }
  
    const pieceIsP1 = isP1Piece(piece);
    if ((moverIsP1 && !pieceIsP1) || (moverIsP2 && pieceIsP1)) {
      return { ok: false, error: { code: "NOT_YOUR_PIECE", message: "You do not own this piece" } };
    }
  
    // Turn check
    const shouldBeP1 = match.isPlayerOneTurn;
    if ((shouldBeP1 && !moverIsP1) || (!shouldBeP1 && !moverIsP2)) {
      return { ok: false, error: { code: "NOT_YOUR_TURN", message: "Not your turn" } };
    }
  
    // Chain enforcement: if chainActive, must move the same piece
    if (match.chainActive && match.chainAt) {
      if (fr !== match.chainAt.row || fc !== match.chainAt.col) {
        return { ok: false, error: { code: "CHAIN_REQUIRED", message: "Must continue capture chain with same piece" } };
      }
      if (!isCapture) {
        return { ok: false, error: { code: "CAPTURE_REQUIRED", message: "Chain requires capture move" } };
      }
    }
  
    // Validate and apply
    const board = match.pieces;
    const blockersEnabled = match.blockersEnabled;
  
    // Destination occupied is invalid unless corner-capture landing on captured (we handle that)
    if (!isCapture && board[tr][tc] != null) {
      return { ok: false, error: { code: "DEST_OCCUPIED", message: "Destination occupied" } };
    }
  
    let capturedPos = null;
    let cornerCaptureLandingOnCaptured = false;
  
    if (isCapture) {
      // blocker's capture not allowed
      if (isBlocker(piece, blockersEnabled)) {
        return { ok: false, error: { code: "ILLEGAL_CAPTURE", message: "Blockers cannot capture" } };
      }
  
      const res = validateImmediateCapture({
        board,
        blockersEnabled,
        fr,
        fc,
        tr,
        tc,
        moverIsP1: pieceIsP1,
      });
  
      if (!res.ok) {
        return { ok: false, error: { code: "ILLEGAL_MOVE", message: "Illegal capture move" } };
      }
  
      capturedPos = res.capturedPos;
      cornerCaptureLandingOnCaptured = res.cornerCaptureLandingOnCaptured;
  
      // Validate client 'captured' matches server
      if (Array.isArray(captured) && captured.length > 0) {
        const c0 = captured[0];
        if (
          Number(c0?.row) !== capturedPos.row ||
          Number(c0?.col) !== capturedPos.col
        ) {
          return { ok: false, error: { code: "CAPTURE_MISMATCH", message: "Captured square mismatch" } };
        }
      }
    } else {
      const res = validateNonCaptureMove({
        board,
        blockersEnabled,
        fr,
        fc,
        tr,
        tc,
      });
      if (!res.ok) {
        return { ok: false, error: { code: "ILLEGAL_MOVE", message: "Illegal move" } };
      }
    }
  
    // Apply move
    const next = cloneBoard(board);
  
    // Remove captured piece (if any)
    let removedPiece = null;
    if (isCapture && capturedPos) {
      removedPiece = next[capturedPos.row][capturedPos.col];
  
      // remove from board first
      next[capturedPos.row][capturedPos.col] = null;
  
      // record capture (skip blockers)
      if (removedPiece && !isBlocker(removedPiece, blockersEnabled)) {
        if (pieceIsP1) match.playerOneCaptured.push(removedPiece);
        else match.playerTwoCaptured.push(removedPiece);
      }
    }
  
    // Move piece (corner capture lands on captured square, but we already nulled it)
    next[fr][fc] = null;
    next[tr][tc] = piece;
  
    match.pieces = next;
  
    // Determine chain continuation (server authoritative)
    let chainContinues = false;
    if (isCapture) {
      chainContinues = immediateCaptureExists({ board: match.pieces, blockersEnabled, r: tr, c: tc });
    }
  
    match.chainActive = !!(isCapture && chainContinues);
    match.chainAt = match.chainActive ? { row: tr, col: tc } : null;
  
    // Turn flip only if chain ended (or if not capture)
    if (!match.chainActive) {
      match.isPlayerOneTurn = !match.isPlayerOneTurn;
    }
  
    // Check winner
    const w = computeWinner(match.pieces, blockersEnabled);
    match.gameEnded = w.gameEnded;
    match.winner = w.winner;
  
    match.updatedAt = now();
  
    if (clientMoveId) match.seenClientMoveIds.add(clientMoveId);
  
    const moveApplied = {
      matchId: match.matchId,
      userId,
      clientMoveId: clientMoveId || null,
      from: { row: fr, col: fc },
      to: { row: tr, col: tc },
      isCapture: !!isCapture,
      captured: capturedPos ? [{ row: capturedPos.row, col: capturedPos.col }] : [],
      cornerCapture: !!cornerCaptureLandingOnCaptured,
      isPlayerOneTurn: match.isPlayerOneTurn,
      chainActive: match.chainActive,
      chainAt: match.chainAt,
      gameEnded: match.gameEnded,
      winner: match.winner,
      ts: now(),
    };
  
    return { ok: true, state: getPublicState(match), moveApplied };
  }
  