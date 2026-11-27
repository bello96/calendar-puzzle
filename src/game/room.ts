import type { Point } from './geometry'
import type { Rect } from './placement'

/**
 * Where on the table a loose piece may lie, in cells: all of it inside
 * `within`, and none of it over any of `clear`.
 */
export interface Room {
  within: Rect
  clear: readonly Rect[]
}

/** Slack for the rounding of sums: boxes that only touch do not overlap. */
const EPS = 1e-9

/** A stretch along one axis, from `lo` to `hi`. */
type Span = readonly [lo: number, hi: number]

/** The upright box that just holds `points`. */
export function boxAround(points: readonly Point[]): Rect {
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const { x, y } of points) {
    if (x < box.left) box.left = x
    if (x > box.right) box.right = x
    if (y < box.top) box.top = y
    if (y > box.bottom) box.bottom = y
  }
  return box
}

/** How far to move the stretch `lo`–`hi` for it to lie between `min` and `max`. One too long for that keeps its start in. */
const fit = (lo: number, hi: number, min: number, max: number) => Math.max(min - lo, Math.min(0, max - hi))

/** The shortest move one way (`dir`) that is inside none of the `banned` spans; their ends are allowed. */
function past(banned: readonly Span[], dir: 1 | -1): number {
  let d = 0
  for (let again = true; again; ) {
    again = false
    for (const [lo, hi] of banned) {
      if (d > lo + EPS && d < hi - EPS) {
        d = dir === 1 ? hi : lo
        again = true
      }
    }
  }
  return d
}

/**
 * How far to move a piece, given as the upright boxes it is made of, for it
 * to lie in the room. It is first brought inside `within`, no further than it
 * has to go. If it then lies over something to keep clear of, it goes on the
 * shortest way that gets it off: straight left, right, up or down, and never
 * back out of `within`. Where no such way is clear it stays where it was
 * brought in to.
 */
export function intoRoom(parts: readonly Rect[], room: Room): Point {
  const { within, clear } = room
  const box = boxAround(parts.flatMap((p) => [{ x: p.left, y: p.top }, { x: p.right, y: p.bottom }]))
  const first = {
    x: fit(box.left, box.right, within.left, within.right),
    y: fit(box.top, box.bottom, within.top, within.bottom),
  }

  // From there: the moves along x, and those along y, that would leave some part of the piece over a block.
  const across: Span[] = []
  const down: Span[] = []
  for (const p of parts) {
    const left = p.left + first.x
    const right = p.right + first.x
    const top = p.top + first.y
    const bottom = p.bottom + first.y
    for (const block of clear) {
      if (top < block.bottom - EPS && bottom > block.top + EPS) across.push([block.left - right, block.right - left])
      if (left < block.right - EPS && right > block.left + EPS) down.push([block.top - bottom, block.bottom - top])
    }
  }

  // And the moves that keep all of it inside.
  const roomAcross: Span = [within.left - box.left - first.x, within.right - box.right - first.x]
  const roomDown: Span = [within.top - box.top - first.y, within.bottom - box.bottom - first.y]
  const inside = ([lo, hi]: Span, d: number) => d >= lo - EPS && d <= hi + EPS

  // The shortest of the four ways; sideways before up or down when they are as short.
  const ways: Point[] = [
    { x: past(across, 1), y: 0 },
    { x: past(across, -1), y: 0 },
    { x: 0, y: past(down, 1) },
    { x: 0, y: past(down, -1) },
  ]
  let best: Point | null = null
  for (const way of ways) {
    if (!inside(roomAcross, way.x) || !inside(roomDown, way.y)) continue
    if (!best || Math.abs(way.x) + Math.abs(way.y) < Math.abs(best.x) + Math.abs(best.y) - EPS) best = way
  }
  return best ? { x: first.x + best.x, y: first.y + best.y } : first
}
