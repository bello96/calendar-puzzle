import { BOARD_COLS, BOARD_ROWS, isBoardCell } from './board'
import { orientations, type Cell } from './geometry'
import { PIECES, type PieceId } from './pieces'

export interface Placement {
  id: PieceId
  cells: Cell[]
}

/*
 * Exact-cover search over the 8×7 grid (56 slots, 50 of them real cells).
 * The grid is held in two 32-bit masks; slots that are not on the board start
 * filled so the search never tries to cover them. We always fill the first
 * empty slot in reading order, trying every piece that can cover it.
 */

const SLOTS = BOARD_ROWS * BOARD_COLS
const slot = (r: number, c: number) => r * BOARD_COLS + c

interface Option {
  lo: number
  hi: number
  cells: Cell[]
}

/** OPTIONS[piece][s] = every placement of that piece whose first slot is s. */
const OPTIONS: Option[][][] = PIECES.map((piece) => {
  const byFirst: Option[][] = Array.from({ length: SLOTS }, () => [])
  for (const { cells } of orientations(piece.cells)) {
    for (let dr = 0; dr < BOARD_ROWS; dr++) {
      for (let dc = 0; dc < BOARD_COLS; dc++) {
        const moved = cells.map(([r, c]): Cell => [r + dr, c + dc])
        if (!moved.every(([r, c]) => isBoardCell(r, c))) continue
        const [lo, hi] = maskOf(moved)
        const first = Math.min(...moved.map(([r, c]) => slot(r, c)))
        byFirst[first].push({ lo, hi, cells: moved })
      }
    }
  }
  return byFirst
})

const SIZES = PIECES.map((p) => p.cells.length)

const NEIGHBORS: number[][] = Array.from({ length: SLOTS }, (_, s) => {
  const r = Math.floor(s / BOARD_COLS)
  const c = s % BOARD_COLS
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ]
    .filter(([nr, nc]) => isBoardCell(nr, nc))
    .map(([nr, nc]) => slot(nr, nc))
})

function maskOf(cells: readonly Cell[]): [number, number] {
  let lo = 0
  let hi = 0
  for (const [r, c] of cells) {
    const s = slot(r, c)
    if (s < 32) lo |= 1 << s
    else hi |= 1 << (s - 32)
  }
  return [lo, hi]
}

const isFilled = (lo: number, hi: number, s: number) => (s < 32 ? lo & (1 << s) : hi & (1 << (s - 32))) !== 0

const lowestZero = (x: number) => {
  const free = ~x
  return free === 0 ? -1 : 31 - Math.clz32(free & -free)
}

/** First empty slot in reading order, or -1 when the grid is full. */
function firstEmpty(lo: number, hi: number): number {
  const a = lowestZero(lo)
  if (a >= 0) return a
  const b = lowestZero(hi)
  return b >= 0 ? 32 + b : -1
}

/** Can a region of `size` cells be tiled by sizes drawn from the remaining pieces? */
function fits(size: number, fours: number, fives: number): boolean {
  for (let j = 0; j <= fives && 5 * j <= size; j++) {
    const rest = size - 5 * j
    if (rest % 4 === 0 && rest / 4 <= fours) return true
  }
  return false
}

const seen = new Uint8Array(SLOTS)
const stack = new Int32Array(SLOTS)

/** Every enclosed empty region must be fillable on its own. */
function regionsFit(lo: number, hi: number, remaining: number): boolean {
  let fours = 0
  let fives = 0
  for (let p = 0; p < SIZES.length; p++) {
    if (remaining & (1 << p)) {
      if (SIZES[p] === 4) fours++
      else fives++
    }
  }
  seen.fill(0)
  for (let s = 0; s < SLOTS; s++) {
    if (seen[s] || isFilled(lo, hi, s)) continue
    let size = 0
    let top = 0
    stack[top++] = s
    seen[s] = 1
    while (top > 0) {
      const cur = stack[--top]
      size++
      for (const n of NEIGHBORS[cur]) {
        if (!seen[n] && !isFilled(lo, hi, n)) {
          seen[n] = 1
          stack[top++] = n
        }
      }
    }
    if (!fits(size, fours, fives)) return false
  }
  return true
}

/**
 * Find a way to place the remaining pieces so that exactly `open` stays
 * uncovered. `fixed` pieces stay where they are. Returns every piece's cells,
 * or null if there is no solution.
 */
export function solve(open: readonly Cell[], fixed: readonly Placement[] = []): Placement[] | null {
  // Off-board slots, plus the unused top byte of `hi`, start filled.
  let lo = 0
  let hi = ~((1 << (SLOTS - 32)) - 1)
  for (let s = 0; s < SLOTS; s++) {
    if (!isBoardCell(Math.floor(s / BOARD_COLS), s % BOARD_COLS)) {
      if (s < 32) lo |= 1 << s
      else hi |= 1 << (s - 32)
    }
  }

  const occupy = (cells: readonly Cell[]) => {
    if (!cells.every(([r, c]) => isBoardCell(r, c))) return false
    const [mlo, mhi] = maskOf(cells)
    if (mlo & lo || mhi & hi) return false
    lo |= mlo
    hi |= mhi
    return true
  }

  if (!occupy(open)) return null
  let remaining = (1 << PIECES.length) - 1
  for (const placement of fixed) {
    const p = PIECES.findIndex((piece) => piece.id === placement.id)
    if (!(remaining & (1 << p)) || !occupy(placement.cells)) return null
    remaining &= ~(1 << p)
  }
  if (!regionsFit(lo, hi, remaining)) return null

  const chosen: Placement[] = []
  const dfs = (lo: number, hi: number, remaining: number): boolean => {
    const s = firstEmpty(lo, hi)
    if (s < 0) return remaining === 0
    for (let p = 0; p < PIECES.length; p++) {
      if (!(remaining & (1 << p))) continue
      for (const opt of OPTIONS[p][s]) {
        if (opt.lo & lo || opt.hi & hi) continue
        const nlo = lo | opt.lo
        const nhi = hi | opt.hi
        const next = remaining & ~(1 << p)
        if (!regionsFit(nlo, nhi, next)) continue
        chosen.push({ id: PIECES[p].id, cells: opt.cells })
        if (dfs(nlo, nhi, next)) return true
        chosen.pop()
      }
    }
    return false
  }

  if (!dfs(lo, hi, remaining)) return null
  return [...fixed.map((f) => ({ id: f.id, cells: [...f.cells] })), ...chosen]
}
