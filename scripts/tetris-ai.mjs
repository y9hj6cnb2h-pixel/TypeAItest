#!/usr/bin/env node
/**
 * A self-contained Tetris engine plus a heuristic AI that plays it.
 *
 * Educational: the interesting part is `evaluate()` and `bestPlacement()` — a
 * one-ply (optionally two-ply) search over every reachable hard-drop position,
 * scored with Dellacherie's six board features. No rendering, no browser, no
 * network — it plays its own board and reports the score.
 *
 * Usage:
 *   node scripts/tetris-ai.mjs                    # play until 115000 points
 *   node scripts/tetris-ai.mjs --target 1000000
 *   node scripts/tetris-ai.mjs --seed 42 --render --delay 40
 *   node scripts/tetris-ai.mjs --lookahead 0      # current piece only
 */

const WIDTH = 10;
const HEIGHT = 20;

// ---------------------------------------------------------------- pieces ---
// Each rotation is a list of [row, col] cells, normalised so the minimum row
// and column are 0.
const PIECES = {
  I: [[[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]]],
  O: [[[0,0],[0,1],[1,0],[1,1]]],
  T: [[[0,1],[1,0],[1,1],[1,2]], [[0,0],[1,0],[1,1],[2,0]],
      [[0,0],[0,1],[0,2],[1,1]], [[0,1],[1,0],[1,1],[2,1]]],
  S: [[[0,1],[0,2],[1,0],[1,1]], [[0,0],[1,0],[1,1],[2,1]]],
  Z: [[[0,0],[0,1],[1,1],[1,2]], [[0,1],[1,0],[1,1],[2,0]]],
  J: [[[0,0],[1,0],[1,1],[1,2]], [[0,0],[0,1],[1,0],[2,0]],
      [[0,0],[0,1],[0,2],[1,2]], [[0,1],[1,1],[2,0],[2,1]]],
  L: [[[0,2],[1,0],[1,1],[1,2]], [[0,0],[1,0],[2,0],[2,1]],
      [[0,0],[0,1],[0,2],[1,0]], [[0,0],[0,1],[1,1],[2,1]]],
};
const NAMES = Object.keys(PIECES);

// Precompute per-rotation width and the lowest cell in each column, so the
// drop distance is a couple of subtractions instead of a collision loop.
const SHAPES = {};
for (const name of NAMES) {
  SHAPES[name] = PIECES[name].map((cells) => {
    const width = Math.max(...cells.map((c) => c[1])) + 1;
    const bottom = new Array(width).fill(-1);
    for (const [r, c] of cells) bottom[c] = Math.max(bottom[c], r);
    return { cells, width, bottom };
  });
}

// ------------------------------------------------------------ randomness ---
// Deterministic PRNG so a run can be reproduced from its seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The 7-bag randomiser used by modern Tetris: every seven pieces contain each
// tetromino exactly once.
function bagger(rand) {
  let bag = [];
  return () => {
    if (bag.length === 0) {
      bag = NAMES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

// ----------------------------------------------------------------- board ---
const newBoard = () => Array.from({ length: HEIGHT }, () => new Uint8Array(WIDTH));
const cloneBoard = (b) => b.map((row) => row.slice());

/** Column heights: distance from the floor to the topmost filled cell. */
function heights(board) {
  const h = new Array(WIDTH).fill(0);
  for (let c = 0; c < WIDTH; c++) {
    for (let r = 0; r < HEIGHT; r++) {
      if (board[r][c]) { h[c] = HEIGHT - r; break; }
    }
  }
  return h;
}

/**
 * Drop `shape` so its left edge sits at column `x`. Returns the row of the
 * piece's top cell, or -1 if it cannot be placed.
 */
function dropRow(board, shape, x, h) {
  let landing = HEIGHT; // topmost row the piece's top cell may occupy
  for (let c = 0; c < shape.width; c++) {
    if (shape.bottom[c] < 0) continue;
    // Top of the stack in this column, minus where this column's lowest
    // piece cell sits relative to the piece's top row.
    const rest = HEIGHT - h[x + c] - 1 - shape.bottom[c];
    if (rest < landing) landing = rest;
  }
  return landing;
}

/** Place a piece and clear full lines. Mutates `board`. */
function place(board, shape, x, top) {
  for (const [r, c] of shape.cells) board[top + r][x + c] = 1;
  let cleared = 0;
  for (let r = HEIGHT - 1; r >= 0; r--) {
    let full = true;
    for (let c = 0; c < WIDTH; c++) if (!board[r][c]) { full = false; break; }
    if (full) {
      cleared++;
      board.splice(r, 1);
      board.unshift(new Uint8Array(WIDTH));
      r++; // re-check the row that slid down into this index
    }
  }
  return cleared;
}

// ------------------------------------------------------------ evaluation ---
// Dellacherie's feature set and weights — six numbers that, together, play
// Tetris well enough to clear millions of lines.
const W = {
  landingHeight:    -4.500158825082766,
  erodedPieceCells:  3.4181268101392694,
  rowTransitions:   -3.2178882868487753,
  columnTransitions:-9.348695305445199,
  holes:            -7.899265427351652,
  cumulativeWells:  -3.3855972247263626,
};

function evaluate(board, landingHeight, erodedPieceCells) {
  let rowTransitions = 0;
  let columnTransitions = 0;
  let holes = 0;
  let cumulativeWells = 0;

  for (let r = 0; r < HEIGHT; r++) {
    const row = board[r];
    let prev = 1; // the left wall counts as filled
    for (let c = 0; c < WIDTH; c++) {
      const cell = row[c];
      if (cell !== prev) rowTransitions++;
      prev = cell;
    }
    if (prev !== 1) rowTransitions++; // and the right wall
  }

  for (let c = 0; c < WIDTH; c++) {
    let prev = 0; // above the board is empty
    let covered = false;
    for (let r = 0; r < HEIGHT; r++) {
      const cell = board[r][c];
      if (cell !== prev) columnTransitions++;
      if (cell) covered = true;
      else if (covered) holes++;
      prev = cell;
    }
    if (prev !== 1) columnTransitions++; // the floor counts as filled
  }

  // A well is a run of empty cells with filled cells (or a wall) on both
  // sides; deeper wells are penalised quadratically.
  for (let c = 0; c < WIDTH; c++) {
    for (let r = 0; r < HEIGHT; r++) {
      if (board[r][c]) continue;
      const leftFilled = c === 0 || board[r][c - 1];
      const rightFilled = c === WIDTH - 1 || board[r][c + 1];
      if (!leftFilled || !rightFilled) continue;
      let depth = 0;
      for (let rr = r; rr < HEIGHT && !board[rr][c]; rr++) depth++;
      cumulativeWells += (depth * (depth + 1)) / 2;
      break; // only the topmost well in a column counts
    }
  }

  return W.landingHeight * landingHeight +
         W.erodedPieceCells * erodedPieceCells +
         W.rowTransitions * rowTransitions +
         W.columnTransitions * columnTransitions +
         W.holes * holes +
         W.cumulativeWells * cumulativeWells;
}

/** Try a placement on a copy of the board; returns null if it does not fit. */
function simulate(board, h, name, rot, x) {
  const shape = SHAPES[name][rot];
  const top = dropRow(board, shape, x, h);
  if (top < 0) return null; // the stack reaches the ceiling here

  const next = cloneBoard(board);
  // Which rows will be cleared, and how many of *this piece's* cells sit in
  // them — that is Dellacherie's "eroded piece cells".
  for (const [r, c] of shape.cells) next[top + r][x + c] = 1;
  const rowsOfPiece = new Map();
  for (const [r] of shape.cells) rowsOfPiece.set(top + r, (rowsOfPiece.get(top + r) || 0) + 1);

  let cleared = 0;
  let pieceCellsCleared = 0;
  for (const [row, count] of rowsOfPiece) {
    let full = true;
    for (let c = 0; c < WIDTH; c++) if (!next[row][c]) { full = false; break; }
    if (full) { cleared++; pieceCellsCleared += count; }
  }
  if (cleared) {
    for (let r = HEIGHT - 1; r >= 0; r--) {
      let full = true;
      for (let c = 0; c < WIDTH; c++) if (!next[r][c]) { full = false; break; }
      if (full) { next.splice(r, 1); next.unshift(new Uint8Array(WIDTH)); r++; }
    }
  }

  const rows = shape.cells.map(([r]) => top + r);
  const landingHeight = HEIGHT - (Math.min(...rows) + Math.max(...rows)) / 2;
  return { board: next, top, cleared, landingHeight, eroded: cleared * pieceCellsCleared };
}

/** Every legal hard-drop placement of one piece. */
function* placements(board, h, name) {
  const rots = SHAPES[name];
  for (let rot = 0; rot < rots.length; rot++) {
    for (let x = 0; x + rots[rot].width <= WIDTH; x++) {
      const sim = simulate(board, h, name, rot, x);
      if (sim) yield { rot, x, sim };
    }
  }
}

/**
 * Pick the best placement for `name`. With `lookahead`, each candidate is
 * scored by how well the *next* piece can then be placed, which is worth a
 * large jump in survival time for a 34x cost per move.
 */
function bestPlacement(board, name, nextName, lookahead) {
  const h = heights(board);
  let best = null;
  let bestScore = -Infinity;

  for (const { rot, x, sim } of placements(board, h, name)) {
    let score = evaluate(sim.board, sim.landingHeight, sim.eroded);

    if (lookahead && nextName) {
      const h2 = heights(sim.board);
      let bestNext = -Infinity;
      for (const p2 of placements(sim.board, h2, nextName)) {
        const s2 = evaluate(p2.sim.board, p2.sim.landingHeight, p2.sim.eroded);
        if (s2 > bestNext) bestNext = s2;
      }
      // Nothing fits after this move: treat it as a losing line of play.
      score = bestNext === -Infinity ? -Infinity : score + bestNext;
    }

    if (score > bestScore) { bestScore = score; best = { rot, x, sim }; }
  }
  return best;
}

// ------------------------------------------------------------------ game ---
const LINE_SCORE = [0, 100, 300, 500, 800]; // guideline scoring, x level

function render(board, stats) {
  const lines = board.map((row) =>
    '│' + Array.from(row, (c) => (c ? '██' : '  ')).join('') + '│');
  process.stdout.write('\x1b[H\x1b[2J');
  console.log(lines.join('\n'));
  console.log('└' + '─'.repeat(WIDTH * 2) + '┘');
  console.log(`score ${stats.score}   lines ${stats.lines}   level ${stats.level}   pieces ${stats.pieces}`);
}

function play({ target, seed, maxPieces, lookahead, doRender, delay }) {
  const board = newBoard();
  const nextPiece = bagger(mulberry32(seed));

  let current = nextPiece();
  let upcoming = nextPiece();
  const stats = { score: 0, lines: 0, level: 1, pieces: 0, tetrises: 0, reason: 'piece-limit' };
  const started = Date.now();

  while (stats.pieces < maxPieces) {
    const move = bestPlacement(board, current, upcoming, lookahead);
    if (!move) { stats.reason = 'topped-out'; break; } // nothing fits any more

    const shape = SHAPES[current][move.rot];

    const cleared = place(board, shape, move.x, move.sim.top);
    stats.pieces++;
    if (cleared) {
      stats.lines += cleared;
      if (cleared === 4) stats.tetrises++;
      stats.score += LINE_SCORE[cleared] * stats.level;
      stats.level = Math.floor(stats.lines / 10) + 1;
    }
    // Hard drop bonus: 2 points per cell fallen.
    stats.score += 2 * Math.max(0, move.sim.top);

    current = upcoming;
    upcoming = nextPiece();

    if (doRender) {
      render(board, stats);
      if (delay) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
    if (stats.score >= target) { stats.reason = 'target'; break; }
  }

  stats.seconds = (Date.now() - started) / 1000;
  return stats;
}

// ------------------------------------------------------------------- cli ---
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const opts = {
  target: Number(arg('target', 115000)),
  seed: Number(arg('seed', Date.now() % 2 ** 31)),
  maxPieces: Number(arg('max-pieces', 500000)),
  lookahead: Number(arg('lookahead', 1)),
  doRender: arg('render', false) === true,
  delay: Number(arg('delay', 0)),
};

const stats = play(opts);
const hit = stats.score >= opts.target;
const headline = {
  target: 'Target reached',
  'topped-out': 'Topped out',
  'piece-limit': 'Stopped at the piece limit',
}[stats.reason];

console.log(`\n${headline} — seed ${opts.seed}, lookahead ${opts.lookahead}`);
console.log(`  score    ${stats.score.toLocaleString('en-US')}  (target ${opts.target.toLocaleString('en-US')})`);
console.log(`  lines    ${stats.lines.toLocaleString('en-US')}   tetrises ${stats.tetrises}`);
console.log(`  level    ${stats.level}`);
console.log(`  pieces   ${stats.pieces.toLocaleString('en-US')} in ${stats.seconds.toFixed(1)}s`);

process.exit(hit ? 0 : 1);
