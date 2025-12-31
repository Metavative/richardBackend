import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ----------------------------------------------------
   BASIC HELPERS
----------------------------------------------------- */

/** Validate that the board is an 8x8 array of strings. */
function isValidBoard(board) {
  if (!Array.isArray(board) || board.length !== 8) return false;
  return board.every(
    (row) => Array.isArray(row) && row.length === 8
  );
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function isPlayer1Piece(piece) {
  return ["W", "S", "T", "D"].includes(piece);
}

function isBotPiece(piece) {
  return ["w", "s", "t", "d"].includes(piece);
}

function isAttacker(piece) {
  return ["W", "S", "T", "w", "s", "t"].includes(piece);
}

/** Count attackers for each side. */
function countAttackers(board) {
  let p1 = 0;
  let bot = 0;
  for (const row of board) {
    for (const cell of row) {
      if (["W", "S", "T"].includes(cell)) p1++;
      if (["w", "s", "t"].includes(cell)) bot++;
    }
  }
  return { p1, bot };
}

/* ----------------------------------------------------
   MOVE GENERATION (for opponent search only)
   Root moves come ONLY from legalMoves provided by client.
----------------------------------------------------- */

function generateMovesForPiece(board, row, col, piece, turn) {
  const isP1Turn = turn === 0;
  const isMine = isP1Turn ? isPlayer1Piece(piece) : isBotPiece(piece);
  if (!isMine) return [];

  const moves = [];
  const dirsOrth = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const dirsDiag = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let directions = [];
  const type = piece.toUpperCase();

  // Approx La Trel like:
  // W: queen like, S: rook like, T: bishop like, D: 1 step any dir (no capture)
  if (type === "W") {
    directions = [...dirsOrth, ...dirsDiag];
  } else if (type === "S") {
    directions = [...dirsOrth];
  } else if (type === "T") {
    directions = [...dirsDiag];
  } else if (type === "D") {
    directions = [...dirsOrth, ...dirsDiag];
  }

  const isFriendly = (target) =>
    isP1Turn ? isPlayer1Piece(target) : isBotPiece(target);
  const isEnemy = (target) =>
    isP1Turn ? isBotPiece(target) : isPlayer1Piece(target);

  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;
    let step = 1;

    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const target = board[r][c];

      if (type === "D") {
        // Defender, only 1 step non capture
        if (step === 1 && !target) {
          moves.push({
            piece,
            from: [row, col],
            to: [r, c],
            isCapture: false,
            captured: null,
          });
        }
        break;
      }

      if (!target) {
        moves.push({
          piece,
          from: [row, col],
          to: [r, c],
          isCapture: false,
          captured: null,
        });
      } else {
        if (!isFriendly(target)) {
          if (isAttacker(piece)) {
            moves.push({
              piece,
              from: [row, col],
              to: [r, c],
              isCapture: true,
              captured: target,
            });
          }
        }
        break;
      }

      if (["W", "S", "T"].includes(type)) {
        r += dr;
        c += dc;
        step++;
      } else {
        break;
      }
    }
  }

  return moves;
}

/** Only used for opponent replies in search. */
function generateAllMoves(board, turn) {
  const allMoves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece === "") continue;
      const moves = generateMovesForPiece(board, r, c, piece, turn);
      allMoves.push(...moves);
    }
  }
  return allMoves;
}

/* ----------------------------------------------------
   MOVE APPLICATION
----------------------------------------------------- */

function applyMove(board, move) {
  const newBoard = cloneBoard(board);
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const pieceOnBoard = newBoard[fr][fc];

  const piece = pieceOnBoard || move.piece;
  newBoard[fr][fc] = "";
  newBoard[tr][tc] = piece;

  return newBoard;
}

/* ----------------------------------------------------
   POSITION EVALUATION
   Strongly focused on winning, remove enemy attackers,
   keep your own, with some positional flavor.
----------------------------------------------------- */

function evaluateBoard(board, povTurn) {
  // povTurn, side we are evaluating from (0, P1, 1, Bot)
  const { p1, bot } = countAttackers(board);
  const myAttackers = povTurn === 0 ? p1 : bot;
  const oppAttackers = povTurn === 0 ? bot : p1;

  // Hard win or loss
  if (oppAttackers === 0 && myAttackers > 0) return 10000;
  if (myAttackers === 0 && oppAttackers > 0) return -10000;

  let score = 0;

  // Attackers difference, big weight
  score += (myAttackers - oppAttackers) * 300;

  // Centralization and activity
  const center = 3.5;
  let myPieces = 0;
  let oppPieces = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece === "") continue;

      const distCenter = Math.abs(r - center) + Math.abs(c - center);
      const centralBonus = (4 - distCenter) * 2;

      const isMine =
        povTurn === 0 ? isPlayer1Piece(piece) : isBotPiece(piece);
      if (isMine) {
        score += centralBonus;
        myPieces++;
      } else {
        score -= centralBonus;
        oppPieces++;
      }
    }
  }

  // Mobility bonus
  const myMoves = generateAllMoves(board, povTurn).length;
  const oppMoves = generateAllMoves(board, 1 - povTurn).length;
  score += (myMoves - oppMoves) * 2;

  return score;
}

/* ----------------------------------------------------
   NEGAMAX SEARCH (FOR OPPONENT REPLIES)
----------------------------------------------------- */

function negamax(board, turn, depth, alpha, beta, povTurn) {
  if (depth === 0) {
    return evaluateBoard(board, povTurn);
  }

  const moves = generateAllMoves(board, turn);
  if (moves.length === 0) {
    return evaluateBoard(board, povTurn);
  }

  let best = -Infinity;

  for (const move of moves) {
    const newBoard = applyMove(board, move);
    const score = -negamax(
      newBoard,
      1 - turn,
      depth - 1,
      -beta,
      -alpha,
      povTurn
    );

    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

/* ----------------------------------------------------
   LEGAL MOVES FROM CLIENT ONLY (NO ILLEGAL SUGGESTIONS)
----------------------------------------------------- */

/** Check if move is at least consistent with board and side to move. */
function isConsistentWithBoard(board, move, turn) {
  if (!move || !Array.isArray(move.from) || !Array.isArray(move.to)) return false;
  if (move.from.length !== 2 || move.to.length !== 2) return false;

  const [fr, fc] = move.from.map(Number);
  const [tr, tc] = move.to.map(Number);

  if (
    Number.isNaN(fr) || Number.isNaN(fc) ||
    Number.isNaN(tr) || Number.isNaN(tc)
  ) return false;

  if (fr < 0 || fr > 7 || fc < 0 || fc > 7) return false;
  if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return false;

  const pieceOnBoard = board[fr]?.[fc];
  if (!pieceOnBoard || pieceOnBoard === "") return false;

  if (move.piece && move.piece !== pieceOnBoard) return false;

  const isP1Turn = turn === 0;
  if (isP1Turn && !isPlayer1Piece(pieceOnBoard)) return false;
  if (!isP1Turn && !isBotPiece(pieceOnBoard)) return false;

  return true;
}

/**
 * Strongly win focused scoring of only legalMoves from client.
 * No move that is not in legalMoves will ever be suggested.
 */
function searchBestAmongLegalMoves(board, turn, legalMoves, depth = 2, maxMovesToReturn = 10) {
  const filtered = legalMoves
    .filter((m) => isConsistentWithBoard(board, m, turn))
    .map((m) => ({
      piece: m.piece,
      from: m.from,
      to: m.to,
      isCapture: !!m.isCapture,
      captured: m.captured ?? null,
    }));

  if (filtered.length === 0) return [];

  const results = [];

  const { p1: beforeP1, bot: beforeBot } = countAttackers(board);
  const beforeMyAttackers = turn === 0 ? beforeP1 : beforeBot;
  const beforeOppAttackers = turn === 0 ? beforeBot : beforeP1;

  for (const move of filtered) {
    const boardAfter = applyMove(board, move);
    const { p1, bot } = countAttackers(boardAfter);
    const myAttackersAfter = turn === 0 ? p1 : bot;
    const oppAttackersAfter = turn === 0 ? bot : p1;

    let immediateWin = false;
    let score = 0;

    if (oppAttackersAfter === 0 && myAttackersAfter > 0) {
      // direct win, kill all enemy attackers
      immediateWin = true;
      score = 10000;
    } else {
      // Base search, look ahead with POV = current player
      const searchScore = -negamax(
        boardAfter,
        1 - turn,
        depth - 1,
        -Infinity,
        Infinity,
        turn
      );

      score += searchScore;

      // Strong heuristics focused on winning

      // delta attackers (opponent)
      const deltaOpp = beforeOppAttackers - oppAttackersAfter;
      // delta attackers (me)
      const deltaMe = beforeMyAttackers - myAttackersAfter;

      // Reward reducing opponent attackers
      score += deltaOpp * 600;

      // Penalty for losing own attackers
      score -= deltaMe * 800;

      // Bonus if this move captures an enemy attacker
      if (move.isCapture && isAttacker(move.captured)) {
        score += 1000;
      }

      // Preference for attacker lead
      const attackerLeadAfter = myAttackersAfter - oppAttackersAfter;
      score += attackerLeadAfter * 100;
    }

    results.push({
      move,
      score,
      immediateWin,
      myAttackersAfter,
      oppAttackersAfter,
    });
  }

  // Sort by score, immediate wins first
  results.sort((a, b) => {
    if (a.immediateWin && !b.immediateWin) return -1;
    if (!a.immediateWin && b.immediateWin) return 1;
    return b.score - a.score;
  });

  return results.slice(0, maxMovesToReturn);
}

/* ----------------------------------------------------
   STATIC ANALYSIS (PHASE, TEACHING POINTS)
----------------------------------------------------- */

function basicAnalysis(board, turn, gameMode, moveHistory = []) {
  const flat = board.flat();

  const attackersP1 = flat.filter((c) => ["W", "S", "T"].includes(c)).length;
  const attackersBot = flat.filter((c) => ["w", "s", "t"].includes(c)).length;
  const defendersP1 = flat.filter((c) => c === "D").length;
  const defendersBot = flat.filter((c) => c === "d").length;

  const pieceCount = flat.filter((c) => c && c !== "").length;

  let gamePhase = "opening";
  if (pieceCount <= 8) gamePhase = "endgame";
  else if (pieceCount <= 16) gamePhase = "middlegame";

  const materialBalance = attackersP1 - attackersBot;

  const currentPlayerIsP1 = turn === 0;
  const currentAttackers = currentPlayerIsP1 ? attackersP1 : attackersBot;
  const opponentAttackers = currentPlayerIsP1 ? attackersBot : attackersP1;

  const attackerAdvantage = currentAttackers - opponentAttackers;
  const likelyWinningPosition =
    attackerAdvantage >= 2 && opponentAttackers <= 2;

  const teachingPoints = [];

  if (attackerAdvantage > 0) {
    teachingPoints.push(
      "You have more attackers than your opponent; trade wisely and look for chances to remove the remaining enemy attackers."
    );
  } else if (attackerAdvantage < 0) {
    teachingPoints.push(
      "You have fewer attackers than your opponent; be extra careful and try to eliminate enemy attackers whenever it is safe."
    );
  } else {
    teachingPoints.push(
      "Attackers are balanced; small mistakes matter, so focus on keeping your pieces safe and slowly improving your position."
    );
  }

  if (likelyWinningPosition && currentAttackers > 0 && opponentAttackers > 0) {
    teachingPoints.push(
      "You are close to a winning position, look for sequences that safely eliminate the last enemy attackers."
    );
  }

  teachingPoints.push("Always check if any of your pieces are hanging (unprotected).");
  teachingPoints.push("Prefer safe captures, especially when they remove enemy attackers.");
  teachingPoints.push("Avoid making a move that improves your position but leaves a key piece undefended.");

  const beginnerTips = [
    "Before every move, ask, can this piece be captured for free",
    "Try to move your pieces toward the center if it is safe.",
    "Capturing an enemy attacker safely is usually very strong.",
    "Use defenders to support and protect your attackers.",
  ];

  return {
    gamePhase,
    attackersP1,
    attackersBot,
    defendersP1,
    defendersBot,
    materialBalance,
    teachingPoints,
    beginnerTips,
    turnCount: moveHistory.length,
    isPlayer1Turn: currentPlayerIsP1,
    gameMode,
    currentAttackers,
    opponentAttackers,
    attackerAdvantage,
    likelyWinningPosition,
  };
}

function formatBoardForPrompt(board) {
  return board
    .map((row, r) => `${r}: ${row.map((c) => (c === "" ? "." : c)).join(" ")}`)
    .join("\n");
}

/* ----------------------------------------------------
   ENGINE TO TEACHER SUMMARY
----------------------------------------------------- */

function buildEngineSummary(board, turn, analysis, scoredMoves) {
  const currentPlayer = turn === 0 ? "Player 1 (Light / UPPERCASE)" : "Bot (Dark / lowercase)";
  const boardString = formatBoardForPrompt(board);

  const topMovesForPrompt = scoredMoves.slice(0, 5).map((entry, idx) => {
    const { move, score, immediateWin, myAttackersAfter, oppAttackersAfter } =
      entry;
    return {
      index: idx,
      piece: move.piece,
      from: move.from,
      to: move.to,
      isCapture: move.isCapture,
      captured: move.captured || null,
      score,
      immediateWin,
      myAttackersAfter,
      oppAttackersAfter,
    };
  });

  return { currentPlayer, boardString, topMovesForPrompt };
}

/* ----------------------------------------------------
   TEACHER LLM (TEXT ONLY, NO MOVES)
----------------------------------------------------- */

async function getTeacherExplanation(board, turn, gameMode, moveHistory, analysis, scoredMoves) {
  const { currentPlayer, boardString, topMovesForPrompt } = buildEngineSummary(
    board,
    turn,
    analysis,
    scoredMoves
  );

  const immediateWinAvailable = scoredMoves.some((m) => m.immediateWin);

  const prompt = `
You are a LA TREL COACH for beginners.

You do not invent moves. The engine already chose the moves.
You only explain them clearly.

GAME INFO:
 Current player: ${currentPlayer}
 Game mode: ${analysis.gameMode}
 Game phase: ${analysis.gamePhase}
 Turn number: ${analysis.turnCount + 1}
 Player1 attackers: ${analysis.attackersP1}
 Bot attackers: ${analysis.attackersBot}
 Current player attackers: ${analysis.currentAttackers}
 Opponent attackers: ${analysis.opponentAttackers}
 Attacker advantage for current player: ${analysis.attackerAdvantage}
 Likely winning position: ${analysis.likelyWinningPosition}
 Immediate winning move (engine): ${immediateWinAvailable}

BOARD (8x8, "." = empty):
${boardString}

ENGINE TOP MOVES (already sorted from best to worse, all guaranteed playable by the client's engine):
${JSON.stringify(topMovesForPrompt, null, 2)}

Your job:

1. Explain the POSITION and the ENGINE'S PLAN, not to invent new moves.
2. Focus on:
   Safety of the current player's pieces.
   Elimination of enemy attackers.
   How the best moves push toward a win.
3. Use very simple language suitable for new players.
4. Mention why captures or non captures are good:
   "This move removes an enemy attacker safely."
   "This move improves your piece while staying safe."
5. If an immediate win sequence exists (engine shows immediateWin = true), explain that clearly.

Respond in strict JSON with this shape:

{
  "summary": "Short summary of the position for the current player.",
  "positionalAssessment": "1–3 sentences describing the position and who stands better.",
  "strategicPlan": "1–3 sentences about how the current player should try to win (safety + elimination).",
  "teachingPoints": [ "practical, position specific teaching points" ],
  "beginnerTips": [ "up to 3 short general tips for this position" ],
  "dangerAlert": "Immediate dangers for the current player (if any).",
  "opportunityAlert": "Immediate opportunities from the engine moves.",
  "nextSteps": "Concrete advice for the next move or two."
}
`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "You are a kind but strong La Trel coach for beginners. You never invent coordinates. You only explain the engine's choices.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 1200,
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Empty completion from teacher model");

    const json = JSON.parse(text);
    return json;
  } catch (err) {
    console.error("Teacher LLM error:", err.message);

    return {
      summary:
        "Focus on keeping your pieces safe and use the suggested moves to reduce the number of enemy attackers.",
      positionalAssessment:
        analysis.attackerAdvantage > 0
          ? "You are ahead in attackers. With careful play, you can push for a win."
          : analysis.attackerAdvantage < 0
          ? "You are behind in attackers. You must be very careful and try to trade or capture enemy attackers safely."
          : "The position is balanced. One or two mistakes can decide the game.",
      strategicPlan:
        "Look for safe captures against enemy attackers, avoid leaving your attackers hanging, and move toward more active and central squares.",
      teachingPoints: analysis.teachingPoints,
      beginnerTips: analysis.beginnerTips.slice(0, 3),
      dangerAlert:
        "Always double check that your important pieces are not hanging before you move.",
      opportunityAlert:
        "Check if one of the suggested moves safely captures an enemy attacker or improves your worst placed piece.",
      nextSteps:
        "Pick one of the top suggested moves that either captures an enemy attacker safely or improves your piece activity.",
    };
  }
}

/* ----------------------------------------------------
   MAIN CONTROLLER, /ai/coach
----------------------------------------------------- */

export const aiCoach = async (req, res) => {
  console.log("aiCoach (legalMoves + win focused scoring) called");

  try {
    const {
      board,
      moveHistory = [],
      turn,
      gameMode = "standard",
      legalMoves,
    } = req.body;

    if (!isValidBoard(board) || typeof turn !== "number") {
      return res.status(400).json({
        error: "Invalid request",
        message:
          "Expected { board: 8x8 array, turn: number, moveHistory?: [], gameMode?: string, legalMoves?: [] }",
      });
    }

    const analysis = basicAnalysis(board, turn, gameMode, moveHistory);

    let scoredMoves = [];
    let recommendedMoves = [];
    let immediateWinAvailable = false;

    if (Array.isArray(legalMoves) && legalMoves.length > 0) {
      // Only score moves that your engine says are legal
      scoredMoves = searchBestAmongLegalMoves(board, turn, legalMoves, 2, 10);
      immediateWinAvailable = scoredMoves.some((m) => m.immediateWin);

      recommendedMoves = scoredMoves.slice(0, 5).map((entry) => {
        const { move, score, immediateWin, myAttackersAfter, oppAttackersAfter } =
          entry;
        const [fr, fc] = move.from;
        const [tr, tc] = move.to;

        let reason = "";
        const teachingPrinciples = [];

        if (move.isCapture && isAttacker(move.captured)) {
          reason = "Captures an enemy attacker, bringing you much closer to a win.";
          teachingPrinciples.push("Eliminate enemy attackers when it is safe.");
        } else if (move.isCapture) {
          reason = "Captures an enemy piece and improves your material balance.";
          teachingPrinciples.push("Take material when it is safe.");
        } else {
          reason = "Improves your piece activity and keeps you safer.";
          teachingPrinciples.push("Improve your worst placed pieces.");
          teachingPrinciples.push("Move toward the center when safe.");
        }

        if (immediateWin && oppAttackersAfter === 0) {
          teachingPrinciples.push("Finish the game by removing all enemy attackers.");
          reason = "This move leads to an immediate win by eliminating all enemy attackers.";
        }

        const priority =
          immediateWin || score > 9000
            ? "winning"
            : score > 500
            ? "high"
            : score > 0
            ? "medium"
            : "low";

        return {
          piece: move.piece || board[fr][fc],
          from: [fr, fc],
          to: [tr, tc],
          isCapture: move.isCapture,
          captured: move.captured || null,
          score,
          priority,
          reason,
          myAttackersAfter,
          oppAttackersAfter,
          teachingPrinciple: teachingPrinciples.join(" "),
        };
      });
    } else {
      console.warn(
        "No legalMoves provided. Will not suggest moves to avoid unplayable suggestions."
      );
    }

    const teacherJson = await getTeacherExplanation(
      board,
      turn,
      gameMode,
      moveHistory,
      analysis,
      scoredMoves
    );

    const responsePayload = {
      summary: teacherJson.summary,
      gamePhase: analysis.gamePhase,
      player1Attackers: analysis.attackersP1,
      botAttackers: analysis.attackersBot,
      winningInfo: {
        immediateWin: immediateWinAvailable,
        comment:
          teacherJson.winningComment ||
          (immediateWinAvailable
            ? "There is at least one move that can immediately eliminate all enemy attackers."
            : "No clear forced win in one move, but the top moves increase your winning chances."),
      },
      teachingPoints: teacherJson.teachingPoints || analysis.teachingPoints,
      beginnerTips: teacherJson.beginnerTips || analysis.beginnerTips.slice(0, 3),
      positionalAssessment: teacherJson.positionalAssessment,
      strategicPlan: teacherJson.strategicPlan,
      // These moves are always a subset of your legalMoves, ranked by winning help
      recommendedMoves,
      dangerAlert: teacherJson.dangerAlert,
      opportunityAlert: teacherJson.opportunityAlert,
      nextSteps: teacherJson.nextSteps,
      engineMeta: {
        attackerAdvantage: analysis.attackerAdvantage,
        likelyWinningPosition: analysis.likelyWinningPosition,
        depthUsed: 2,
        legalMovesUsed: Array.isArray(legalMoves) ? legalMoves.length : 0,
      },
    };

    return res.json(responsePayload);
  } catch (err) {
    console.error("Fatal error in aiCoach:", err);
    return res.status(500).json({
      error: "Internal server error",
      message: "AI coach encountered an unexpected error.",
    });
  }
};

export default aiCoach;
