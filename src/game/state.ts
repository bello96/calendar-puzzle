import { BOARD_CELLS, dateFromCells, isBoardCell, targetCells, type BoardDate } from './board'
import { bounds, mirrorPoint, mod, normalize, orient, rotatePoint, type Cell, type Point } from './geometry'
import { PIECE_BY_ID, PIECE_IDS, type PieceId } from './pieces'
import { snapToBoard } from './placement'
import { solve, type Placement } from './solver'

/**
 * Where a piece is. Positions are in cells, with (0, 0) at the top-left of
 * the board's cut-out; `loose` pieces can be anywhere on the table, including
 * resting on top of the board.
 */
export type Spot = { kind: 'board'; row: number; col: number } | { kind: 'loose'; x: number; y: number }

export interface PieceState {
  id: PieceId
  /** Quarter turns. Kept as a running count so animations never unwind. */
  turns: number
  /** Half flips; odd means the piece is upside down (mirrored). */
  flips: number
  spot: Spot
}

export type PieceMap = Record<PieceId, PieceState>

type Orientation = Pick<PieceState, 'turns' | 'flips'>

export interface Pose extends Orientation {
  row: number
  col: number
}

export const isFlipped = (p: Orientation) => mod(p.flips, 2) === 1

export function shapeOf(p: Orientation & { id: PieceId }): Cell[] {
  return orient(PIECE_BY_ID[p.id].cells, p.turns, isFlipped(p))
}

export function topLeftOf(p: PieceState): Point {
  return p.spot.kind === 'board' ? { x: p.spot.col, y: p.spot.row } : { x: p.spot.x, y: p.spot.y }
}

export function centerOf(p: PieceState): Point {
  const { rows, cols } = bounds(shapeOf(p))
  const tl = topLeftOf(p)
  return { x: tl.x + cols / 2, y: tl.y + rows / 2 }
}

export function cellsOnBoard(p: PieceState): Cell[] | null {
  if (p.spot.kind !== 'board') return null
  const { row, col } = p.spot
  return shapeOf(p).map(([r, c]): Cell => [r + row, c + col])
}

/** Is a board cell covered by a placed piece (other than `except`)? */
export function takenBy(pieces: PieceMap, except?: PieceId): (row: number, col: number) => boolean {
  const taken = new Set<string>()
  for (const id of PIECE_IDS) {
    if (id === except) continue
    for (const [r, c] of cellsOnBoard(pieces[id]) ?? []) taken.add(`${r},${c}`)
  }
  return (r, c) => taken.has(`${r},${c}`)
}

/** Put a piece exactly at `topLeft`: into the board if it lines up with free cells, otherwise resting loose. */
function settle(pieces: PieceMap, p: PieceState, topLeft: Point): PieceState {
  const row = Math.round(topLeft.y)
  const col = Math.round(topLeft.x)
  if (Math.abs(topLeft.x - col) < 1e-6 && Math.abs(topLeft.y - row) < 1e-6) {
    const taken = takenBy(pieces, p.id)
    const fits = shapeOf(p).every(([r, c]) => isBoardCell(row + r, col + c) && !taken(row + r, col + c))
    if (fits) return { ...p, spot: { kind: 'board', row, col } }
  }
  return { ...p, spot: { kind: 'loose', x: topLeft.x, y: topLeft.y } }
}

/** Let go of a piece: it drops into the nearest free slot, or stays where it is. */
export function dropAt(pieces: PieceMap, id: PieceId, topLeft: Point): PieceMap {
  const p = pieces[id]
  const slot = snapToBoard(shapeOf(p), topLeft, takenBy(pieces, id))
  const spot: Spot = slot ? { kind: 'board', ...slot } : { kind: 'loose', x: topLeft.x, y: topLeft.y }
  return { ...pieces, [id]: { ...p, spot } }
}

/** Shifts tried, nearest first, when a placed piece is turned into a spot where it doesn't fit. */
const KICKS: [dx: number, dy: number][] = (() => {
  const kicks: [number, number][] = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) kicks.push([dx, dy])
  return kicks.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || Math.abs(a[1]) - Math.abs(b[1]))
})()

/**
 * Settle a turned or flipped piece around its new centre. A piece that was in
 * the board may slide up to two cells to stay in it (like a wall kick), as
 * long as it still covers the cell it was turned around.
 */
function reposition(pieces: PieceMap, next: PieceState, center: Point, kickAround: Cell | null): PieceMap {
  const shape = shapeOf(next)
  const { rows, cols } = bounds(shape)
  const topLeft = { x: center.x - cols / 2, y: center.y - rows / 2 }
  const row = Math.round(topLeft.y)
  const col = Math.round(topLeft.x)
  const aligned = Math.abs(topLeft.x - col) < 1e-6 && Math.abs(topLeft.y - row) < 1e-6
  if (kickAround && aligned) {
    const taken = takenBy(pieces, next.id)
    for (const [dx, dy] of KICKS) {
      const at = { row: row + dy, col: col + dx }
      const cells = shape.map(([r, c]): Cell => [r + at.row, c + at.col])
      if (!cells.some(([r, c]) => r === kickAround[0] && c === kickAround[1])) continue
      if (cells.every(([r, c]) => isBoardCell(r, c) && !taken(r, c))) {
        return { ...pieces, [next.id]: { ...next, spot: { kind: 'board', ...at } } }
      }
    }
  }
  return { ...pieces, [next.id]: settle(pieces, next, topLeft) }
}

const cellUnder = (p: PieceState, pivot: Point): Cell | null =>
  p.spot.kind === 'board' ? [Math.floor(pivot.y), Math.floor(pivot.x)] : null

/** Quarter turn around `pivot`; dir 1 is clockwise on screen. */
export function turn(pieces: PieceMap, id: PieceId, dir: 1 | -1, pivot: Point): PieceMap {
  const p = pieces[id]
  // Seen through a mirror, turning the piece one way turns its picture the other.
  const next = { ...p, turns: p.turns + (isFlipped(p) ? -dir : dir) }
  return reposition(pieces, next, rotatePoint(centerOf(p), pivot, dir), cellUnder(p, pivot))
}

/** Turn the piece over, left to right, around the vertical line through `pivot`. */
export function flip(pieces: PieceMap, id: PieceId, pivot: Point): PieceMap {
  const p = pieces[id]
  return reposition(pieces, { ...p, flips: p.flips + 1 }, mirrorPoint(centerOf(p), pivot.x), cellUnder(p, pivot))
}

/** Move a piece by whole cells (keyboard), lining it up with the grid first. */
export function nudge(pieces: PieceMap, id: PieceId, dx: number, dy: number): PieceMap {
  const p = pieces[id]
  const tl = topLeftOf(p)
  return { ...pieces, [id]: settle(pieces, p, { x: Math.round(tl.x) + dx, y: Math.round(tl.y) + dy }) }
}

export function openCells(pieces: PieceMap): Cell[] {
  const taken = takenBy(pieces)
  return BOARD_CELLS.filter(([r, c]) => !taken(r, c))
}

export interface Status {
  /** Pieces sitting in the board. */
  placed: number
  /** Every piece is in the board. */
  complete: boolean
  /** Complete, and the open cells spell the target date. */
  solved: boolean
  /** The date the open cells spell once complete, if they spell one. */
  shown: BoardDate | null
}

export function status(pieces: PieceMap, target: Date): Status {
  const placed = PIECE_IDS.filter((id) => pieces[id].spot.kind === 'board').length
  const complete = placed === PIECE_IDS.length
  const shown = complete ? dateFromCells(openCells(pieces)) : null
  const solved =
    !!shown &&
    shown.month === target.getMonth() + 1 &&
    shown.day === target.getDate() &&
    shown.weekday === target.getDay()
  return { placed, complete, solved, shown }
}

const shapeKey = (cells: readonly Cell[]) => normalize(cells).join(';')

/** The pose that puts piece `id` on exactly `cells`, turning it as little as possible from `near`. */
export function orientationFor(id: PieceId, cells: readonly Cell[], near: Orientation): Pose {
  const want = shapeKey(cells)
  const row = Math.min(...cells.map(([r]) => r))
  const col = Math.min(...cells.map(([, c]) => c))
  let best: Pose | null = null
  let bestCost = Infinity
  for (const df of [0, 1]) {
    for (let dt = -2; dt <= 2; dt++) {
      const pose = { turns: near.turns + dt, flips: near.flips + df, row, col }
      const cost = Math.abs(dt) + df * 1.5
      if (cost < bestCost && shapeKey(shapeOf({ id, ...pose })) === want) {
        best = pose
        bestCost = cost
      }
    }
  }
  if (!best) throw new Error(`cells do not match piece ${id}`)
  return best
}

function placementsOf(pieces: PieceMap): Placement[] {
  return PIECE_IDS.flatMap((id) => {
    const cells = cellsOnBoard(pieces[id])
    return cells ? [{ id, cells }] : []
  })
}

export type Hint =
  | { kind: 'done' }
  | { kind: 'covering'; ids: PieceId[] }
  | ({ kind: 'place'; id: PieceId } & Pose)
  | { kind: 'blocking'; id: PieceId }
  | { kind: 'stuck' }

/**
 * What to do next for `target`, keeping the player's pieces where they are.
 * `recent` lists piece ids most-recently-moved first, to blame the newest
 * piece when the board has become unsolvable.
 */
export function hint(pieces: PieceMap, target: Date, recent: readonly PieceId[] = PIECE_IDS): Hint {
  if (status(pieces, target).solved) return { kind: 'done' }
  const open = targetCells(target)
  const isOpen = (r: number, c: number) => open.some(([or, oc]) => or === r && oc === c)
  const covering = PIECE_IDS.filter((id) => cellsOnBoard(pieces[id])?.some(([r, c]) => isOpen(r, c)))
  if (covering.length) return { kind: 'covering', ids: covering }

  const fixed = placementsOf(pieces)
  const solution = solve(open, fixed)
  if (solution) {
    const firstCell = (p: Placement) => Math.min(...p.cells.map(([r, c]) => r * 7 + c))
    const next = solution
      .filter((p) => pieces[p.id].spot.kind !== 'board')
      .sort((a, b) => firstCell(a) - firstCell(b))[0]
    return { kind: 'place', id: next.id, ...orientationFor(next.id, next.cells, pieces[next.id]) }
  }

  const order = [...fixed].sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))
  for (const suspect of order) {
    if (solve(open, fixed.filter((f) => f !== suspect))) return { kind: 'blocking', id: suspect.id }
  }
  return { kind: 'stuck' }
}

/** A full solution for `target`, keeping placed pieces if possible. */
export function answerFor(pieces: PieceMap, target: Date): Record<PieceId, Pose> | null {
  const open = targetCells(target)
  const solution = solve(open, placementsOf(pieces)) ?? solve(open)
  if (!solution) return null
  return Object.fromEntries(
    solution.map((p) => [p.id, orientationFor(p.id, p.cells, pieces[p.id])]),
  ) as Record<PieceId, Pose>
}
