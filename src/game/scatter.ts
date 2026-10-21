import { orient } from './geometry'
import { PIECE_BY_ID, PIECE_IDS, type PieceId } from './pieces'

/**
 * How a piece lies in the tray: the centre of its box in full-size cells from
 * the tray's top-left corner, its quarter turns, and a slight resting angle in
 * degrees.
 */
export interface Lie {
  cx: number
  cy: number
  turns: number
  tilt: number
}

/** How far the pieces keep inside the tray's edges. */
const INSET = 0.1
/** Pieces nearer each other than this push apart, the nearer the harder. */
const REACH = 1.2
/** A slight pull toward the middle, so the pushing doesn't open a hole there. */
const PULL = 0.08
/** Spots tried for each piece as it is first dropped in; it goes where it has the most room. */
const CANDIDATES = 24
const SPREAD_STEPS = 240
const EVEN_STEPS = 80
const ATTEMPTS = 14
/** Good enough: no two pieces nearer than this... */
const GOOD_GAP = 0.3
/** ...and no spot further from a piece than this times the square root of the free room per piece. */
const GOOD_HOLE = 0.6
/** Largest resting angle, in degrees, for a piece with room around it. */
const MAX_TILT = 3

interface Shape {
  /** Cells as flat (row, col) pairs. */
  cells: number[]
  rows: number
  cols: number
}

/** Every piece at each of its quarter turns. */
const SHAPES = Object.fromEntries(
  PIECE_IDS.map((id) => [
    id,
    [0, 1, 2, 3].map((turns): Shape => {
      const cells = orient(PIECE_BY_ID[id].cells, turns, false)
      return {
        cells: cells.flat(),
        rows: Math.max(...cells.map(([r]) => r)) + 1,
        cols: Math.max(...cells.map(([, c]) => c)) + 1,
      }
    }),
  ]),
) as Record<PieceId, Shape[]>

const CELL_COUNT = PIECE_IDS.reduce((n, id) => n + PIECE_BY_ID[id].cells.length, 0)

interface Body extends Shape {
  id: PieceId
  turns: number
  /** Top-left of the box. */
  x: number
  y: number
}

const body = (id: PieceId, turns: number): Body => ({ id, turns, ...SHAPES[id][turns], x: 0, y: 0 })

// Which way the first piece passed to gapBetween should move to get away from the second.
let awayX = 0
let awayY = 0

/**
 * Gap between the nearest cells of two pieces, negative when they overlap;
 * or just `beyond` when they are at least that far apart.
 */
function gapBetween(a: Body, b: Body, beyond = Infinity): number {
  const bx = Math.max(a.x - b.x - b.cols, b.x - a.x - a.cols, 0)
  const by = Math.max(a.y - b.y - b.rows, b.y - a.y - a.rows, 0)
  if (bx * bx + by * by >= beyond * beyond) return beyond
  let least = beyond
  for (let i = 0; i < a.cells.length; i += 2) {
    const ax = a.x + a.cells[i + 1]
    const ay = a.y + a.cells[i]
    for (let j = 0; j < b.cells.length; j += 2) {
      const sx = ax - b.x - b.cells[j + 1]
      const sy = ay - b.y - b.cells[j]
      const dx = (sx < 0 ? -sx : sx) - 1
      const dy = (sy < 0 ? -sy : sy) - 1
      // The gap is at least the larger of the two; most pairs are no nearer than the nearest so far.
      if ((dx > dy ? dx : dy) >= least) continue
      if (dx > 0 && dy > 0) {
        const gap = Math.sqrt(dx * dx + dy * dy)
        if (gap >= least) continue
        least = gap
        awayX = (sx < 0 ? -dx : dx) / gap
        awayY = (sy < 0 ? -dy : dy) / gap
      } else if (dx >= dy) {
        least = dx
        awayX = sx < 0 ? -1 : 1
        awayY = 0
      } else {
        least = dy
        awayX = 0
        awayY = sy < 0 ? -1 : 1
      }
    }
  }
  return least
}

function smallestGap(bodies: Body[], skip?: Body): number {
  let least = Infinity
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (skip && bodies[i] !== skip && bodies[j] !== skip) continue
      least = Math.min(least, gapBetween(bodies[i], bodies[j], least))
    }
  }
  return least
}

/** How far the emptiest spot in the tray is from the nearest piece. */
function emptiest(bodies: Body[], width: number, height: number): number {
  let worst = 0
  for (let y = 0.25; y < height; y += 0.5) {
    for (let x = 0.25; x < width; x += 0.5) {
      let near = Infinity
      for (const b of bodies) {
        for (let i = 0; i < b.cells.length; i += 2) {
          const dx = Math.max(b.x + b.cells[i + 1] - x, 0, x - b.x - b.cells[i + 1] - 1)
          const dy = Math.max(b.y + b.cells[i] - y, 0, y - b.y - b.cells[i] - 1)
          near = Math.min(near, dx * dx + dy * dy)
        }
      }
      worst = Math.max(worst, near)
    }
  }
  return Math.sqrt(worst)
}

/**
 * Let every two pieces nearer than `reach` push each other apart, the
 * nearer the harder, while the tray's edges hold them in. The steps shrink
 * as it goes, so they come to rest; it stops early once they have.
 */
function push(bodies: Body[], width: number, height: number, steps: number, reach: number, pull: number, stride: number) {
  const n = bodies.length
  const fx = new Float64Array(n)
  const fy = new Float64Array(n)
  for (let s = 0; s < steps; s++) {
    const step = stride * (1 - s / steps) + 0.01
    fx.fill(0)
    fy.fill(0)
    for (let i = 0; i < n; i++) {
      const a = bodies[i]
      for (let j = i + 1; j < n; j++) {
        const gap = gapBetween(a, bodies[j], reach)
        if (gap >= reach) continue
        const f = gap < 0 ? 4 * (reach - gap) : 3 * (reach - gap) ** 3
        fx[i] += f * awayX
        fy[i] += f * awayY
        fx[j] -= f * awayX
        fy[j] -= f * awayY
      }
      // Measured in halves of the tray, so a long tray pulls as evenly along as across.
      fx[i] += (pull * (width / 2 - a.x - a.cols / 2)) / (width / 2)
      fy[i] += (pull * (height / 2 - a.y - a.rows / 2)) / (height / 2)
    }
    let moved = 0
    for (let i = 0; i < n; i++) {
      const b = bodies[i]
      const x = Math.min(Math.max(b.x + step * fx[i], INSET), width - INSET - b.cols)
      const y = Math.min(Math.max(b.y + step * fy[i], INSET), height - INSET - b.rows)
      moved = Math.max(moved, Math.abs(x - b.x), Math.abs(y - b.y))
      b.x = x
      b.y = y
    }
    if (moved < 1e-3) return
  }
}

/** One go at a layout: drop the pieces in one by one, turned at random, then spread them out. */
function attempt(width: number, height: number, rand: () => number): Body[] {
  const order = [...PIECE_IDS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const bodies: Body[] = []
  for (const id of order) {
    let pick: Body | null = null
    let room = -Infinity
    for (let k = 0; k < CANDIDATES; k++) {
      const b = body(id, Math.floor(rand() * 4))
      b.x = INSET + rand() * (width - b.cols - 2 * INSET)
      b.y = INSET + rand() * (height - b.rows - 2 * INSET)
      let gap = Infinity
      for (const other of bodies) gap = Math.min(gap, gapBetween(b, other, gap))
      if (gap > room) {
        room = gap
        pick = b
      }
    }
    bodies.push(pick!)
  }
  push(bodies, width, height, SPREAD_STEPS, REACH, PULL, 0.12)
  // Then only the tightest gaps, to widen them where there is room.
  push(bodies, width, height, EVEN_STEPS, Math.max(smallestGap(bodies), 0) + 0.25, 0, 0.04)
  return bodies
}

/**
 * Scatter the ten pieces over a `width` × `height` tray (in full-size cells)
 * the way a hand might spread them out: each in a random spot, turned at
 * random, but none on another and with no big gaps left between them.
 * The same random numbers give the same layout.
 */
export function scatter(width: number, height: number, rand: () => number = Math.random): Record<PieceId, Lie> {
  // A roomier tray leaves bigger gaps however evenly the pieces lie.
  const goodHole = GOOD_HOLE * Math.sqrt((width * height - CELL_COUNT) / PIECE_IDS.length)
  let best: Body[] = []
  let bestScore = -Infinity
  for (let k = 0; k < ATTEMPTS; k++) {
    const bodies = attempt(width, height, rand)
    const gap = smallestGap(bodies)
    const hole = emptiest(bodies, width, height)
    // Room between the pieces matters most, then how evenly they cover the tray.
    const score =
      -10 * Math.max(0, GOOD_GAP - gap) - 3 * Math.max(0, hole - goodHole) + 0.5 * Math.min(gap, 0.6) - 0.2 * hole
    if (score > bestScore) {
      best = bodies
      bestScore = score
    }
    if (gap >= GOOD_GAP && hole <= goodHole) break
  }

  const lies = {} as Record<PieceId, Lie>
  for (const b of best) {
    // Each rests at a slight angle, less so when another piece lies close.
    const room = Math.min(1, Math.max(0, (smallestGap(best, b) - 0.1) / 0.4))
    lies[b.id] = {
      cx: b.x + b.cols / 2,
      cy: b.y + b.rows / 2,
      turns: b.turns,
      tilt: +((rand() * 2 - 1) * MAX_TILT * room).toFixed(2),
    }
  }
  return lies
}
