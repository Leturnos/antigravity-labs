/**
 * ChessEngine - Manages chess rules, move validation, game state, and the AI player.
 * Features: Minimax with Alpha-Beta, Quiescence Search, Zobrist Hashing,
 * Transposition Table, Iterative Deepening, King Endgame PST, Mobility Bonus.
 */

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// Values are from White's perspective (high is good for White).
// For Black, the row index is flipped (7 - r).
const PAWN_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_PST = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_PST = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [-5,  0,  5,  5,  5,  5,  0, -5],
  [0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  5,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_PST = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20]
];

const KING_ENDGAME_PST = [
  [-50,-40,-30,-20,-20,-30,-40,-50],
  [-30,-20,-10,  0,  0,-10,-20,-30],
  [-30,-10, 20, 30, 30, 20,-10,-30],
  [-30,-10, 30, 40, 40, 30,-10,-30],
  [-30,-10, 30, 40, 40, 30,-10,-30],
  [-30,-10, 20, 30, 30, 20,-10,-30],
  [-30,-30,  0,  0,  0,  0,-30,-30],
  [-50,-30,-30,-30,-30,-30,-30,-50]
];

// ============================================================
// Zobrist Hashing for Transposition Table
// ============================================================
const ZOBRIST = {};

(function initZobrist() {
  // Deterministic pseudo-random using a simple LCG seeded value
  let seed = 1070372;
  function rand64() {
    // Generate two 32-bit parts for a 53-bit safe integer
    seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
    const hi = seed >>> 0;
    seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
    const lo = seed >>> 0;
    return (hi * 0x100000) + (lo >>> 12); // 52-bit combined
  }

  const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k'];
  const colors = ['w', 'b'];

  // Piece-square keys
  ZOBRIST.pieces = {};
  for (const color of colors) {
    ZOBRIST.pieces[color] = {};
    for (const type of pieceTypes) {
      ZOBRIST.pieces[color][type] = [];
      for (let sq = 0; sq < 64; sq++) {
        ZOBRIST.pieces[color][type].push(rand64());
      }
    }
  }

  ZOBRIST.side = rand64();

  ZOBRIST.castling = [];
  for (let i = 0; i < 16; i++) {
    ZOBRIST.castling.push(rand64());
  }

  ZOBRIST.enPassant = [];
  for (let i = 0; i < 9; i++) {
    ZOBRIST.enPassant.push(rand64());
  }
})();

const TT_EXACT = 0;
const TT_ALPHA = 1; // Upper bound
const TT_BETA = 2;  // Lower bound

const TT_MAX_SIZE = 500000;
let transpositionTable = new Map();

function ttStore(hash, depth, score, flag, bestMove) {
  if (transpositionTable.size > TT_MAX_SIZE) {
    transpositionTable.clear();
  }
  transpositionTable.set(hash, { depth, score, flag, bestMove });
}

function ttLookup(hash) {
  return transpositionTable.get(hash) || null;
}

// ============================================================

class ChessGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = this.createInitialBoard();
    this.turn = 'w';
    this.castlingRights = {
      w: { kingSide: true, queenSide: true },
      b: { kingSide: true, queenSide: true }
    };
    this.enPassant = null; // Stores target square { r, c } if en passant is possible
    this.halfmoveClock = 0;
    this.history = [];
    this.zobristHash = this._computeFullHash();
    transpositionTable.clear();
  }

  createInitialBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    
    const backRow = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    
    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: backRow[c], color: 'b' };
      board[1][c] = { type: 'p', color: 'b' };
      board[6][c] = { type: 'p', color: 'w' };
      board[7][c] = { type: 'r', color: 'w' }; // Back row for white
    }
    board[7][0] = { type: 'r', color: 'w' };
    board[7][1] = { type: 'n', color: 'w' };
    board[7][2] = { type: 'b', color: 'w' };
    board[7][3] = { type: 'q', color: 'w' };
    board[7][4] = { type: 'k', color: 'w' };
    board[7][5] = { type: 'b', color: 'w' };
    board[7][6] = { type: 'n', color: 'w' };
    board[7][7] = { type: 'r', color: 'w' };

    return board;
  }

  _computeFullHash() {
    let h = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) {
          h ^= ZOBRIST.pieces[p.color][p.type][r * 8 + c];
        }
      }
    }
    if (this.turn === 'b') h ^= ZOBRIST.side;

    let castleIdx = 0;
    if (this.castlingRights.w.kingSide) castleIdx |= 1;
    if (this.castlingRights.w.queenSide) castleIdx |= 2;
    if (this.castlingRights.b.kingSide) castleIdx |= 4;
    if (this.castlingRights.b.queenSide) castleIdx |= 8;
    h ^= ZOBRIST.castling[castleIdx];

    if (this.enPassant) {
      h ^= ZOBRIST.enPassant[this.enPassant.c];
    } else {
      h ^= ZOBRIST.enPassant[8];
    }
    return h;
  }

  cloneBoard(board) {
    return board.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  getPiece(r, c) {
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      return this.board[r][c];
    }
    return null;
  }

  getBoardHash() {
    let s = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) {
          s += p.color + p.type;
        } else {
          s += '..';
        }
      }
    }
    s += '|' + this.turn;
    s += '|' + (this.castlingRights.w.kingSide ? 'K' : '') + (this.castlingRights.w.queenSide ? 'Q' : '');
    s += '|' + (this.castlingRights.b.kingSide ? 'k' : '') + (this.castlingRights.b.queenSide ? 'q' : '');
    s += '|' + (this.enPassant ? `${this.enPassant.r},${this.enPassant.c}` : '-');
    return s;
  }

  isThreefoldRepetition() {
    const hash = this.getBoardHash();
    let count = 1;
    for (const state of this.history) {
      if (state.hash === hash) {
        count++;
      }
    }
    return count >= 3;
  }

  /**
   * Generates pseudo-legal moves for a piece at (r, c).
   * These moves are valid based on movement mechanics, but might leave the King in check.
   */
  getPseudoMoves(r, c) {
    const piece = this.getPiece(r, c);
    if (!piece) return [];
    
    const moves = [];
    const color = piece.color;
    const opponent = color === 'w' ? 'b' : 'w';

    switch (piece.type) {
      case 'p': {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;

        const f1Row = r + dir;
        if (f1Row >= 0 && f1Row < 8 && !this.getPiece(f1Row, c)) {
          if (f1Row === promoRow) {
            ['q', 'r', 'b', 'n'].forEach(p => {
              moves.push({ from: { r, c }, to: { r: f1Row, c }, type: 'promotion', promotionPiece: p, piece });
            });
          } else {
            moves.push({ from: { r, c }, to: { r: f1Row, c }, type: 'normal', piece });
          }

          const f2Row = r + 2 * dir;
          if (r === startRow && !this.getPiece(f2Row, c)) {
            moves.push({ from: { r, c }, to: { r: f2Row, c }, type: 'normal', piece });
          }
        }

        for (const dc of [-1, 1]) {
          const tc = c + dc;
          if (tc >= 0 && tc < 8) {
            const targetPiece = this.getPiece(f1Row, tc);
            if (targetPiece && targetPiece.color === opponent) {
              if (f1Row === promoRow) {
                ['q', 'r', 'b', 'n'].forEach(p => {
                  moves.push({ from: { r, c }, to: { r: f1Row, c: tc }, type: 'promotion', promotionPiece: p, captured: targetPiece, piece });
                });
              } else {
                moves.push({ from: { r, c }, to: { r: f1Row, c: tc }, type: 'normal', captured: targetPiece, piece });
              }
            }
            
            if (this.enPassant && this.enPassant.r === f1Row && this.enPassant.c === tc) {
              const epCapturedPiece = this.getPiece(r, tc);
              if (epCapturedPiece && epCapturedPiece.color === opponent && epCapturedPiece.type === 'p') {
                moves.push({ from: { r, c }, to: { r: f1Row, c: tc }, type: 'enPassant', captured: epCapturedPiece, piece });
              }
            }
          }
        }
        break;
      }

      case 'n': {
        const offsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of offsets) {
          const tr = r + dr;
          const tc = c + dc;
          if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const target = this.getPiece(tr, tc);
            if (!target) {
              moves.push({ from: { r, c }, to: { r: tr, c: tc }, type: 'normal', piece });
            } else if (target.color === opponent) {
              moves.push({ from: { r, c }, to: { r: tr, c: tc }, type: 'normal', captured: target, piece });
            }
          }
        }
        break;
      }

      case 'b':
      case 'r':
      case 'q': {
        const dirs = [];
        if (piece.type === 'r' || piece.type === 'q') {
          dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        }
        if (piece.type === 'b' || piece.type === 'q') {
          dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }

        for (const [dr, dc] of dirs) {
          let tr = r + dr;
          let tc = c + dc;
          while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const target = this.getPiece(tr, tc);
            if (!target) {
              moves.push({ from: { r, c }, to: { r: tr, c: tc }, type: 'normal', piece });
            } else {
              if (target.color === opponent) {
                moves.push({ from: { r, c }, to: { r: tr, c: tc }, type: 'normal', captured: target, piece });
              }
              break; // Blocked
            }
            tr += dr;
            tc += dc;
          }
        }
        break;
      }

      case 'k': {
        const dirs = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1]
        ];
        for (const [dr, dc] of dirs) {
          const tr = r + dr;
          const tc = c + dc;
          if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const target = this.getPiece(tr, tc);
            if (!target) {
              moves.push({ from: { r, c }, to: { r: tr, c: tc }, type: 'normal', piece });
            } else if (target.color === opponent) {
              moves.push({ from: { r, c }, to: { r: tr, c: tc }, type: 'normal', captured: target, piece });
            }
          }
        }

        const rights = this.castlingRights[color];
        if (rights) {
          const kingRow = color === 'w' ? 7 : 0;
          if (r === kingRow && c === 4 && !this.isInCheck(color)) {
            if (rights.kingSide) {
              const empty1 = !this.getPiece(kingRow, 5);
              const empty2 = !this.getPiece(kingRow, 6);
              if (empty1 && empty2) {
                if (!this.isSquareAttacked(kingRow, 5, opponent) && !this.isSquareAttacked(kingRow, 6, opponent)) {
                  moves.push({ from: { r, c }, to: { r: kingRow, c: 6 }, type: 'castling', piece });
                }
              }
            }
            if (rights.queenSide) {
              const empty1 = !this.getPiece(kingRow, 1);
              const empty2 = !this.getPiece(kingRow, 2);
              const empty3 = !this.getPiece(kingRow, 3);
              if (empty1 && empty2 && empty3) {
                if (!this.isSquareAttacked(kingRow, 3, opponent) && !this.isSquareAttacked(kingRow, 2, opponent)) {
                  moves.push({ from: { r, c }, to: { r: kingRow, c: 2 }, type: 'castling', piece });
                }
              }
            }
          }
        }
        break;
      }
    }

    return moves;
  }

  /**
   * Filters pseudo-legal moves to only return completely legal chess moves.
   */
  getLegalMoves(color) {
    const legalMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.getPiece(r, c);
        if (piece && piece.color === color) {
          const pseudo = this.getPseudoMoves(r, c);
          for (const move of pseudo) {
            this.makeMove(move);
            if (!this.isInCheck(color)) {
              legalMoves.push(move);
            }
            this.undoMove();
          }
        }
      }
    }
    return legalMoves;
  }

  /**
   * Generates only capture moves (for quiescence search).
   */
  getLegalCaptures(color) {
    const captures = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.getPiece(r, c);
        if (piece && piece.color === color) {
          const pseudo = this.getPseudoMoves(r, c);
          for (const move of pseudo) {
            if (!move.captured) continue;
            this.makeMove(move);
            if (!this.isInCheck(color)) {
              captures.push(move);
            }
            this.undoMove();
          }
        }
      }
    }
    return captures;
  }

  /**
   * Check if a square (r, c) is attacked by any piece of attackerColor.
   */
  isSquareAttacked(r, c, attackerColor) {
    // 1. Check for Knight attacks
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightOffsets) {
      const p = this.getPiece(r + dr, c + dc);
      if (p && p.color === attackerColor && p.type === 'n') return true;
    }

    // 2. Check for Pawn attacks
    const pawnDir = attackerColor === 'w' ? 1 : -1; // Pawn attacking (r, c) comes from opposite directions
    for (const dc of [-1, 1]) {
      const p = this.getPiece(r + pawnDir, c + dc);
      if (p && p.color === attackerColor && p.type === 'p') return true;
    }

    // 3. Check for sliding attacks (Bishop, Rook, Queen)
    const slideDirs = [
      { dir: [-1, 0], types: ['r', 'q'] },
      { dir: [1, 0], types: ['r', 'q'] },
      { dir: [0, -1], types: ['r', 'q'] },
      { dir: [0, 1], types: ['r', 'q'] },
      { dir: [-1, -1], types: ['b', 'q'] },
      { dir: [-1, 1], types: ['b', 'q'] },
      { dir: [1, -1], types: ['b', 'q'] },
      { dir: [1, 1], types: ['b', 'q'] }
    ];

    for (const { dir, types } of slideDirs) {
      let tr = r + dir[0];
      let tc = c + dir[1];
      while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
        const p = this.getPiece(tr, tc);
        if (p) {
          if (p.color === attackerColor && types.includes(p.type)) {
            return true;
          }
          break; // Blocked by any piece
        }
        tr += dir[0];
        tc += dir[1];
      }
    }

    // 4. Check for King attacks
    const kingDirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    for (const [dr, dc] of kingDirs) {
      const p = this.getPiece(r + dr, c + dc);
      if (p && p.color === attackerColor && p.type === 'k') return true;
    }

    return false;
  }

  /**
   * Finds the King's position for a specific color.
   */
  findKing(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === 'k' && p.color === color) {
          return { r, c };
        }
      }
    }
    return null;
  }

  /**
   * Checks if the King of the specified color is in check.
   */
  isInCheck(color) {
    const kingPos = this.findKing(color);
    if (!kingPos) return false;
    const opponent = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingPos.r, kingPos.c, opponent);
  }

  /**
   * Makes a move on the board and saves the state to history.
   */
  makeMove(move) {
    const hash = this.getBoardHash();
    // Save state to history for undoing
    this.history.push({
      board: this.cloneBoard(this.board),
      turn: this.turn,
      castlingRights: {
        w: { ...this.castlingRights.w },
        b: { ...this.castlingRights.b }
      },
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      halfmoveClock: this.halfmoveClock,
      hash: hash,
      zobristHash: this.zobristHash
    });

    const { from, to, type, piece, promotionPiece } = move;

    let nextEnPassant = null;

    if (type === 'normal') {
      this.board[to.r][to.c] = this.board[from.r][from.c];
      this.board[from.r][from.c] = null;

      if (piece.type === 'p' && Math.abs(from.r - to.r) === 2) {
        nextEnPassant = { r: (from.r + to.r) / 2, c: from.c };
      }
    } else if (type === 'castling') {
      const row = piece.color === 'w' ? 7 : 0;
      this.board[to.r][to.c] = this.board[from.r][from.c];
      this.board[from.r][from.c] = null;

      if (to.c === 6) {
        this.board[row][5] = this.board[row][7];
        this.board[row][7] = null;
      } else if (to.c === 2) {
        this.board[row][3] = this.board[row][0];
        this.board[row][0] = null;
      }
    } else if (type === 'enPassant') {
      this.board[to.r][to.c] = this.board[from.r][from.c];
      this.board[from.r][from.c] = null;
      this.board[from.r][to.c] = null;
    } else if (type === 'promotion') {
      this.board[to.r][to.c] = { type: promotionPiece || 'q', color: piece.color };
      this.board[from.r][from.c] = null;
    }

    if (piece.type === 'k') {
      this.castlingRights[piece.color].kingSide = false;
      this.castlingRights[piece.color].queenSide = false;
    } else if (piece.type === 'r') {
      if (from.r === (piece.color === 'w' ? 7 : 0)) {
        if (from.c === 7) this.castlingRights[piece.color].kingSide = false;
        if (from.c === 0) this.castlingRights[piece.color].queenSide = false;
      }
    }

    if (move.captured && move.captured.type === 'r') {
      const opp = piece.color === 'w' ? 'b' : 'w';
      const oppRow = opp === 'w' ? 7 : 0;
      if (to.r === oppRow) {
        if (to.c === 7) this.castlingRights[opp].kingSide = false;
        if (to.c === 0) this.castlingRights[opp].queenSide = false;
      }
    }

    if (piece.type === 'p' || move.captured) {
      this.halfmoveClock = 0;
    } else {
      this.halfmoveClock++;
    }

    this.enPassant = nextEnPassant;
    this.turn = this.turn === 'w' ? 'b' : 'w';

    this.zobristHash = this._computeFullHash();
  }

  /**
   * Undoes the last move, restoring board state from history.
   */
  undoMove() {
    if (this.history.length === 0) return false;
    const prev = this.history.pop();
    this.board = prev.board;
    this.turn = prev.turn;
    this.castlingRights = prev.castlingRights;
    this.enPassant = prev.enPassant;
    this.halfmoveClock = prev.halfmoveClock;
    this.zobristHash = prev.zobristHash;
    return true;
  }

  /**
   * Returns 'checkmate', 'stalemate', 'draw' (50-move rule), or 'active'.
   */
  getGameStatus() {
    if (this.isThreefoldRepetition()) {
      return 'draw-repetition';
    }
    const moves = this.getLegalMoves(this.turn);
    if (moves.length === 0) {
      if (this.isInCheck(this.turn)) {
        return 'checkmate';
      }
      return 'stalemate';
    }
    if (this.halfmoveClock >= 100) {
      return 'draw'; // 50 full moves (100 halfmoves) with no pawn move or capture
    }
    if (this.isInsufficientMaterial()) {
      return 'draw';
    }
    return 'active';
  }

  isInsufficientMaterial() {
    let wPieces = [];
    let bPieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) {
          if (p.type === 'k') continue;
          if (p.color === 'w') wPieces.push(p.type);
          else bPieces.push(p.type);
        }
      }
    }

    const total = wPieces.length + bPieces.length;
    if (total === 0) return true; // King vs King
    if (total === 1) {
      // King + Bishop vs King OR King + Knight vs King
      const all = [...wPieces, ...bPieces];
      if (all[0] === 'b' || all[0] === 'n') return true;
    }
    if (total === 2 && wPieces.length === 1 && bPieces.length === 1) {
      // King + Bishop vs King + Bishop (if they are on same square color, but we can approximate as draw)
      if (wPieces[0] === 'b' && bPieces[0] === 'b') return true;
    }
    return false;
  }

  /**
   * Checks if we are in an endgame phase (few pieces remaining).
   */
  isEndgame() {
    let totalMaterial = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type !== 'k' && p.type !== 'p') {
          totalMaterial += PIECE_VALUES[p.type];
        }
      }
    }
    return totalMaterial <= 1300; // Roughly 2 rooks or 1 queen + minor
  }
}

/**
 * Static evaluation function.
 * Evaluates the board from White's perspective.
 * Includes: material, PST, endgame king PST, and mobility bonus.
 */
function evaluateBoard(game) {
  const board = game.board;
  const isEndgame = game.isEndgame();
  let score = 0;
  let wMobility = 0;
  let bMobility = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        let val = PIECE_VALUES[piece.type];
        let pstVal = 0;

        const rowLookUp = piece.color === 'w' ? r : 7 - r;
        switch (piece.type) {
          case 'p': pstVal = PAWN_PST[rowLookUp][c]; break;
          case 'n': pstVal = KNIGHT_PST[rowLookUp][c]; break;
          case 'b': pstVal = BISHOP_PST[rowLookUp][c]; break;
          case 'r': pstVal = ROOK_PST[rowLookUp][c]; break;
          case 'q': pstVal = QUEEN_PST[rowLookUp][c]; break;
          case 'k':
            pstVal = isEndgame
              ? KING_ENDGAME_PST[rowLookUp][c]
              : KING_PST[rowLookUp][c];
            break;
        }

        const total = val + pstVal;
        if (piece.color === 'w') {
          score += total;
        } else {
          score -= total;
        }

        if (piece.type !== 'k' && piece.type !== 'p') {
          const moves = game.getPseudoMoves(r, c);
          if (piece.color === 'w') {
            wMobility += moves.length;
          } else {
            bMobility += moves.length;
          }
        }
      }
    }
  }

  score += (wMobility - bMobility) * 3;

  return score;
}

/**
 * Quiescence Search - continues evaluating captures beyond the search horizon
 * to avoid the "horizon effect" where the engine stops in the middle of a capture sequence.
 */
function quiescenceSearch(game, alpha, beta, isMaximizing) {
  const standPat = evaluateBoard(game);

  if (isMaximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  const color = isMaximizing ? 'w' : 'b';
  const captures = game.getLegalCaptures(color);

  captures.sort((a, b) => {
    const aVal = a.captured ? PIECE_VALUES[a.captured.type] - PIECE_VALUES[a.piece.type] / 100 : 0;
    const bVal = b.captured ? PIECE_VALUES[b.captured.type] - PIECE_VALUES[b.piece.type] / 100 : 0;
    return bVal - aVal;
  });

  if (isMaximizing) {
    for (const move of captures) {
      game.makeMove(move);
      const score = quiescenceSearch(game, alpha, beta, false);
      game.undoMove();
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return alpha;
  } else {
    for (const move of captures) {
      game.makeMove(move);
      const score = quiescenceSearch(game, alpha, beta, true);
      game.undoMove();
      if (score < beta) beta = score;
      if (alpha >= beta) break;
    }
    return beta;
  }
}

/**
 * Minimax with Alpha-Beta Pruning and Quiescence Search.
 * Uses Transposition Table for previously evaluated positions.
 */
function minimax(game, depth, alpha, beta, isMaximizing) {
  // Check transposition table
  const hash = game.zobristHash;
  const ttEntry = ttLookup(hash);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) return ttEntry.score;
    if (ttEntry.flag === TT_BETA && ttEntry.score >= beta) return ttEntry.score;
    if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return ttEntry.score;
  }

  if (depth === 0) {
    return quiescenceSearch(game, alpha, beta, isMaximizing);
  }

  const color = isMaximizing ? 'w' : 'b';
  const moves = game.getLegalMoves(color);

  if (moves.length === 0) {
    if (game.isInCheck(color)) {
      // Checkmate. Prefer faster mates, so factor in depth.
      return isMaximizing ? (-25000 + (5 - depth)) : (25000 - (5 - depth));
    }
    return 0; // Stalemate
  }

  // Move ordering: TT best move first, then captures (MVV-LVA), then quiet moves
  const ttBestMove = ttEntry ? ttEntry.bestMove : null;
  moves.sort((a, b) => {
    // TT best move first
    if (ttBestMove) {
      const aIsTT = a.from.r === ttBestMove.from.r && a.from.c === ttBestMove.from.c &&
                    a.to.r === ttBestMove.to.r && a.to.c === ttBestMove.to.c;
      const bIsTT = b.from.r === ttBestMove.from.r && b.from.c === ttBestMove.from.c &&
                    b.to.r === ttBestMove.to.r && b.to.c === ttBestMove.to.c;
      if (aIsTT) return -1;
      if (bIsTT) return 1;
    }
    const aVal = a.captured ? PIECE_VALUES[a.captured.type] * 10 - PIECE_VALUES[a.piece.type] : 0;
    const bVal = b.captured ? PIECE_VALUES[b.captured.type] * 10 - PIECE_VALUES[b.piece.type] : 0;
    return bVal - aVal;
  });

  let bestMove = moves[0];

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.makeMove(move);
      const ev = minimax(game, depth - 1, alpha, beta, false);
      game.undoMove();
      if (ev > maxEval) {
        maxEval = ev;
        bestMove = move;
      }
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break; // Prune
    }
    // Store in TT
    const flag = maxEval <= alpha ? TT_ALPHA : maxEval >= beta ? TT_BETA : TT_EXACT;
    ttStore(hash, depth, maxEval, flag, bestMove);
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.makeMove(move);
      const ev = minimax(game, depth - 1, alpha, beta, true);
      game.undoMove();
      if (ev < minEval) {
        minEval = ev;
        bestMove = move;
      }
      beta = Math.min(beta, ev);
      if (beta <= alpha) break; // Prune
    }
    // Store in TT
    const flag = minEval >= beta ? TT_BETA : minEval <= alpha ? TT_ALPHA : TT_EXACT;
    ttStore(hash, depth, minEval, flag, bestMove);
    return minEval;
  }
}

/**
 * Finds the best move using Iterative Deepening with Alpha-Beta Pruning.
 * Starts from depth 1 and goes up to the target depth.
 * Returns { move, score }.
 */
function getBestMove(game, depth = 3) {
  const color = game.turn;
  const moves = game.getLegalMoves(color);
  if (moves.length === 0) return { move: null, score: 0 };

  const isWhite = color === 'w';
  let bestMove = moves[0];
  let bestScore = isWhite ? -Infinity : Infinity;

  // Iterative Deepening: search from depth 1 to target depth
  for (let d = 1; d <= depth; d++) {
    let currentBest = null;
    let currentScore = isWhite ? -Infinity : Infinity;

    // Order moves: use previous iteration's best move first
    if (bestMove) {
      moves.sort((a, b) => {
        const aIsBest = a.from.r === bestMove.from.r && a.from.c === bestMove.from.c &&
                        a.to.r === bestMove.to.r && a.to.c === bestMove.to.c;
        const bIsBest = b.from.r === bestMove.from.r && b.from.c === bestMove.from.c &&
                        b.to.r === bestMove.to.r && b.to.c === bestMove.to.c;
        if (aIsBest) return -1;
        if (bIsBest) return 1;
        const aVal = a.captured ? PIECE_VALUES[a.captured.type] : 0;
        const bVal = b.captured ? PIECE_VALUES[b.captured.type] : 0;
        return bVal - aVal;
      });
    }

    for (const move of moves) {
      game.makeMove(move);
      const score = minimax(game, d - 1, -Infinity, Infinity, !isWhite);
      game.undoMove();

      if (isWhite) {
        if (score > currentScore) {
          currentScore = score;
          currentBest = move;
        }
      } else {
        if (score < currentScore) {
          currentScore = score;
          currentBest = move;
        }
      }
    }

    if (currentBest) {
      bestMove = currentBest;
      bestScore = currentScore;
    }
  }

  return { move: bestMove, score: bestScore };
}
