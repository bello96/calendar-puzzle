import { describe, expect, it } from 'vitest'
import { bounds, orient, type Point } from './geometry'
import { PIECE_BY_ID, PIECE_IDS, type PieceId } from './pieces'
import { scatter, type Lie } from './scatter'
import { cellSquares } from './stacking'
import { seeded } from './testing/random'

const DEALS = 60

/** Top-left corners of a lying piece's cells, ignoring its slight tilt. */
function corners(id: PieceId, lie: Lie): Point[] {
  const shape = orient(PIECE_BY_ID[id].cells, lie.turns, false)
  const { rows, cols } = bounds(shape)
  return shape.map(([r, c]) => ({ x: lie.cx - cols / 2 + c, y: lie.cy - rows / 2 + r }))
}

/** Gap between the nearest cells of two lying pieces (negative if they overlap). */
function gap(a: Point[], b: Point[]): number {
  let least = Infinity
  for (const p of a) {
    for (const q of b) {
      const dx = Math.abs(p.x - q.x) - 1
      const dy = Math.abs(p.y - q.y) - 1
      least = Math.min(least, dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy))
    }
  }
  return least
}

const smallestGap = (lies: Record<PieceId, Lie>) =>
  Math.min(...PIECE_IDS.flatMap((a) => PIECE_IDS.filter((b) => a < b).map((b) => gap(corners(a, lies[a]), corners(b, lies[b])))))

/** How far the emptiest spot in the tray is from the nearest piece. */
function emptiest(lies: Record<PieceId, Lie>, width: number, height: number): number {
  const cells = PIECE_IDS.flatMap((id) => corners(id, lies[id]))
  let worst = 0
  for (let y = 0.1; y < height; y += 0.2) {
    for (let x = 0.1; x < width; x += 0.2) {
      const near = Math.min(...cells.map((c) => Math.hypot(Math.max(c.x - x, 0, x - c.x - 1), Math.max(c.y - y, 0, y - c.y - 1))))
      worst = Math.max(worst, near)
    }
  }
  return worst
}

/** Do two convex polygons overlap, or come within `margin` of each other? */
function near(a: Point[], b: Point[], margin: number): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const len = Math.hypot(q.x - p.x, q.y - p.y)
      const n = { x: (p.y - q.y) / len, y: (q.x - p.x) / len }
      const along = (v: Point) => v.x * n.x + v.y * n.y
      const sa = a.map(along)
      const sb = b.map(along)
      if (Math.max(...sa) + margin <= Math.min(...sb) || Math.max(...sb) + margin <= Math.min(...sa)) return false
    }
  }
  return true
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

// The emptiest spot the old fixed layout left in each tray, measured the same way.
describe.each([
  [11, 9, 1.94],
  [15, 7.5, 1.96],
])('scatter over a %s × %s tray', (width, height, oldHole) => {
  const deals = Array.from({ length: DEALS }, (_, i) => scatter(width, height, seeded(i + 1)))

  it('keeps every piece inside the tray', () => {
    for (const lies of deals) {
      for (const id of PIECE_IDS) {
        for (const c of corners(id, lies[id])) {
          expect(c.x).toBeGreaterThanOrEqual(0)
          expect(c.y).toBeGreaterThanOrEqual(0)
          expect(c.x + 1).toBeLessThanOrEqual(width)
          expect(c.y + 1).toBeLessThanOrEqual(height)
        }
      }
    }
  })

  it('leaves a clear gap between every two pieces, tilted as they are drawn', () => {
    for (const lies of deals) {
      expect(smallestGap(lies)).toBeGreaterThanOrEqual(0.2)
      const drawn = PIECE_IDS.map((id) => {
        const { rows, cols } = bounds(orient(PIECE_BY_ID[id].cells, lies[id].turns, false))
        const spot = { kind: 'loose' as const, x: lies[id].cx - cols / 2, y: lies[id].cy - rows / 2 }
        return cellSquares({ id, turns: lies[id].turns, flips: 0, spot, tilt: lies[id].tilt, scale: 1 })
      })
      for (let i = 0; i < drawn.length; i++) {
        for (let j = i + 1; j < drawn.length; j++) {
          const touching = drawn[i].some((a) => drawn[j].some((b) => near(a, b, 0.05)))
          expect(touching, `${PIECE_IDS[i]} and ${PIECE_IDS[j]}`).toBe(false)
        }
      }
    }
    // Typically at least as much room as the old fixed layout had (0.36 between its closest two).
    expect(median(deals.map(smallestGap))).toBeGreaterThanOrEqual(0.36)
  })

  it('spreads the pieces evenly, leaving no big empty patch', () => {
    const holes = deals.map((lies) => emptiest(lies, width, height))
    // Never a bigger empty patch than the old fixed layout left, and usually a much smaller one.
    for (const hole of holes) expect(hole).toBeLessThanOrEqual(oldHole)
    expect(median(holes)).toBeLessThanOrEqual(oldHole - 0.4)
  })

  it('lays the pieces out differently every time', () => {
    for (const id of PIECE_IDS) {
      const xs = deals.map((lies) => lies[id].cx)
      const ys = deals.map((lies) => lies[id].cy)
      // Each piece turns up all over the tray, at every quarter turn it has...
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(width * 0.6)
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(height * 0.5)
      expect(new Set(deals.map((lies) => lies[id].turns % 4)).size).toBe(4)
    }
    // ...and no two layouts are alike.
    const keys = deals.map((lies) => PIECE_IDS.map((id) => `${lies[id].cx.toFixed(1)},${lies[id].cy.toFixed(1)}`).join(' '))
    expect(new Set(keys).size).toBe(DEALS)
  })

  it('rests the pieces only slightly askew', () => {
    for (const lies of deals) for (const id of PIECE_IDS) expect(Math.abs(lies[id].tilt)).toBeLessThanOrEqual(3)
  })
})

it('lays out the same way again from the same random numbers', () => {
  expect(scatter(11, 9, seeded(7))).toEqual(scatter(11, 9, seeded(7)))
})
