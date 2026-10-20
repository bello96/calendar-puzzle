import { isBoardCell } from './board'
import { bounds, type Cell, type Point } from './geometry'

export interface BoardSpot {
  row: number
  col: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** How far (in cells) a dropped piece may slide to reach a free slot. */
const SLIDE_LIMIT = 0.65
/** Within this many cells of its slot, a dragged piece leans into it. */
const MAGNET = 0.32

/**
 * Where a piece would land if dropped with its bounding box's top-left at
 * `topLeft` (board coordinates, in cells): the nearest slot where every cell
 * is on the board and not `taken`. Null when nothing fits close enough.
 */
export function snapToBoard(
  shape: readonly Cell[],
  topLeft: Point,
  taken: (row: number, col: number) => boolean,
): BoardSpot | null {
  const rows = [...new Set([Math.floor(topLeft.y), Math.ceil(topLeft.y)])]
  const cols = [...new Set([Math.floor(topLeft.x), Math.ceil(topLeft.x)])]
  const candidates = rows
    .flatMap((row) => cols.map((col) => ({ row, col, d: Math.hypot(col - topLeft.x, row - topLeft.y) })))
    .filter((s) => s.d <= SLIDE_LIMIT)
    .sort((a, b) => a.d - b.d)
  for (const { row, col } of candidates) {
    if (shape.every(([r, c]) => isBoardCell(row + r, col + c) && !taken(row + r, col + c))) return { row, col }
  }
  return null
}

/**
 * For a piece held with its centre at `center`: the slot it would drop into,
 * and how far to draw it towards that slot (the pull grows from nothing at
 * the edge of the magnet to the full distance on top of the slot).
 */
export function aimAt(
  shape: readonly Cell[],
  center: Point,
  taken: (row: number, col: number) => boolean,
): { slot: BoardSpot | null; pull: Point } {
  const { rows, cols } = bounds(shape)
  const topLeft = { x: center.x - cols / 2, y: center.y - rows / 2 }
  const slot = snapToBoard(shape, topLeft, taken)
  if (!slot) return { slot, pull: { x: 0, y: 0 } }
  const dx = slot.col - topLeft.x
  const dy = slot.row - topLeft.y
  const d = Math.hypot(dx, dy)
  if (d >= MAGNET) return { slot, pull: { x: 0, y: 0 } }
  const k = 1 - d / MAGNET
  return { slot, pull: { x: dx * k, y: dy * k } }
}
