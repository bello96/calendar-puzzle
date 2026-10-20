import { bounds, type Point } from './geometry'
import { centerOf, isFlipped, shapeOf, type PieceState } from './state'

/** A piece as it is drawn: where it lies, the slight angle it rests at, and its size. */
export interface Drawn extends PieceState {
  /** Resting angle in degrees, clockwise (shown mirrored while the piece is face down). */
  tilt: number
  /** Drawing size; pieces lying in a phone's tray are drawn smaller. */
  scale: number
}

/**
 * How deep (in cells) the cells of two pieces may overlap and the pieces
 * still only touch: each piece is cut a little inside its cells, and a
 * hairline overlap reads as lying side by side, not one on the other.
 */
const TOUCH = 0.15

/** Each cell of the piece as the four corners of the square it is drawn as. */
export function cellSquares(p: Drawn): Point[][] {
  const shape = shapeOf(p)
  const { rows, cols } = bounds(shape)
  const c = centerOf(p)
  const tilt = ((isFlipped(p) ? -p.tilt : p.tilt) * Math.PI) / 180
  const cos = Math.cos(tilt) * p.scale
  const sin = Math.sin(tilt) * p.scale
  const at = (x: number, y: number): Point => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos })
  return shape.map(([r, col]) => {
    const x = col - cols / 2
    const y = r - rows / 2
    return [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)]
  })
}

/** How far apart two convex polygons would have to be pushed to stop overlapping (0 if they don't). */
function depth(a: Point[], b: Point[]): number {
  let least = Infinity
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const len = Math.hypot(q.x - p.x, q.y - p.y)
      const n = { x: (p.y - q.y) / len, y: (q.x - p.x) / len }
      const along = (v: Point) => v.x * n.x + v.y * n.y
      const sa = a.map(along)
      const sb = b.map(along)
      least = Math.min(least, Math.min(Math.max(...sa), Math.max(...sb)) - Math.max(Math.min(...sa), Math.min(...sb)))
      if (least <= 0) return 0
    }
  }
  return least
}

/** Do the two pieces, as drawn, overlap by more than a hairline (one lying on the other)? */
export function overlapping(a: Drawn, b: Drawn): boolean {
  const bs = cellSquares(b)
  return cellSquares(a).some((sa) => bs.some((sb) => depth(sa, sb) > TOUCH))
}
