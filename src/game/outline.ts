import type { Cell, Point } from './geometry'

/**
 * Outline of a set of cells (no holes) as a clockwise polygon, starting at
 * the top-left corner. With `inset`, every edge moves inward by that much,
 * which leaves a hairline gap between neighbouring pieces like a laser kerf.
 */
export function outlinePolygon(cells: readonly Cell[], inset = 0): Point[] {
  const filled = new Set(cells.map(([r, c]) => `${r},${c}`))
  const has = (r: number, c: number) => filled.has(`${r},${c}`)

  // Unit edges with the shape on their right-hand side (clockwise on screen).
  const next = new Map<string, Point>()
  const add = (x1: number, y1: number, x2: number, y2: number) => next.set(`${x1},${y1}`, { x: x2, y: y2 })
  for (const [r, c] of cells) {
    if (!has(r - 1, c)) add(c, r, c + 1, r)
    if (!has(r, c + 1)) add(c + 1, r, c + 1, r + 1)
    if (!has(r + 1, c)) add(c + 1, r + 1, c, r + 1)
    if (!has(r, c - 1)) add(c, r + 1, c, r)
  }

  const minY = Math.min(...cells.map(([r]) => r))
  const minX = Math.min(...cells.filter(([r]) => r === minY).map(([, c]) => c))
  const start = { x: minX, y: minY }

  // Walk the edges, keeping only the points where the direction changes.
  const walk: Point[] = [start]
  let at = next.get(`${start.x},${start.y}`)!
  while (at.x !== start.x || at.y !== start.y) {
    walk.push(at)
    at = next.get(`${at.x},${at.y}`)!
  }
  const corners = walk.filter((p, i) => {
    const prev = walk[(i - 1 + walk.length) % walk.length]
    const nxt = walk[(i + 1) % walk.length]
    return (p.x - prev.x) * (nxt.y - p.y) - (p.y - prev.y) * (nxt.x - p.x) !== 0
  })

  if (!inset) return corners
  // Move each corner along both edges' inward normals (right-hand side: (-dy, dx)).
  return corners.map((p, i) => {
    const prev = corners[(i - 1 + corners.length) % corners.length]
    const nxt = corners[(i + 1) % corners.length]
    const inDir = { x: Math.sign(p.x - prev.x), y: Math.sign(p.y - prev.y) }
    const outDir = { x: Math.sign(nxt.x - p.x), y: Math.sign(nxt.y - p.y) }
    return { x: p.x + inset * (-inDir.y - outDir.y), y: p.y + inset * (inDir.x + outDir.x) }
  })
}

const fmt = (n: number) => +n.toFixed(4)

/** SVG path through a clockwise polygon with rounded corners (outer and inner radii differ). */
export function roundedPath(points: readonly Point[], outerRadius: number, innerRadius = outerRadius): string {
  const n = points.length
  let d = ''
  points.forEach((p, i) => {
    const prev = points[(i - 1 + n) % n]
    const nxt = points[(i + 1) % n]
    const lenIn = Math.hypot(p.x - prev.x, p.y - prev.y)
    const lenOut = Math.hypot(nxt.x - p.x, nxt.y - p.y)
    const convex = (p.x - prev.x) * (nxt.y - p.y) - (p.y - prev.y) * (nxt.x - p.x) > 0
    const r = Math.min(convex ? outerRadius : innerRadius, lenIn / 2, lenOut / 2)
    const a = { x: p.x + ((prev.x - p.x) / lenIn) * r, y: p.y + ((prev.y - p.y) / lenIn) * r }
    const b = { x: p.x + ((nxt.x - p.x) / lenOut) * r, y: p.y + ((nxt.y - p.y) / lenOut) * r }
    d += `${i === 0 ? 'M' : 'L'}${fmt(a.x)} ${fmt(a.y)}Q${fmt(p.x)} ${fmt(p.y)} ${fmt(b.x)} ${fmt(b.y)}`
  })
  return d + 'Z'
}
