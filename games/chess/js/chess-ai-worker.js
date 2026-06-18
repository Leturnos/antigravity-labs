/**
 * Chess AI Worker - Offloads search tree calculation from the main UI thread.
 */
self.importScripts('engine.js');

self.onmessage = function(e) {
  const { board, turn, castlingRights, enPassant, halfmoveClock, history, depth } = e.data;
  
  // Instantiate a fresh ChessGame container and restore state
  const game = new ChessGame();
  game.board = board;
  game.turn = turn;
  game.castlingRights = castlingRights;
  game.enPassant = enPassant;
  game.halfmoveClock = halfmoveClock;
  game.history = history || [];
  game.zobristHash = game._computeFullHash();
  
  // Calculate best move using the chess engine minimax logic
  const result = getBestMove(game, depth);
  
  self.postMessage(result);
};
