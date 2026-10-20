/** A grid cell as [row, col]. Rows grow downward, like the screen. */
export type Cell = readonly [row: number, col: number]

export interface Point {
  x: number
  y: number
}

/** Shift cells so the top-left of their bounding box is (0, 0), sorted in reading order. */
export function normalize(cells: readonly Cell[]): Cell[] {
  let minR = Infinity
  let minC = Infinity
  for (const [r, c] of cells) {
    if (r < minR) minR = r
    if (c < minC) minC = c
  }
  return cells
    .map(([r, c]): Cell => [r - minR, c - minC])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Quarter turn clockwise as seen on screen. */
export function rotateCW(cells: readonly Cell[]): Cell[] {
  return normalize(cells.map(([r, c]): Cell => [c, -r]))
}

/** Mirror left-to-right. */
export function mirrorH(cells: readonly Cell[]): Cell[] {
  return normalize(cells.map(([r, c]): Cell => [r, -c]))
}

export const mod = (n: number, m: number) => ((n % m) + m) % m

/**
 * Orientation used everywhere in the game: rotate `turns` quarter turns
 * clockwise, then mirror if `flipped`. This matches the CSS transform
 * `rotateY(flip) rotate(turns)` applied around the piece's centre.
 */
export function orient(cells: readonly Cell[], turns: number, flipped: boolean): Cell[] {
  let out = normalize(cells)
  for (let i = 0; i < mod(turns, 4); i++) out = rotateCW(out)
  return flipped ? mirrorH(out) : out
}

export interface Orientation {
  rot: 0 | 1 | 2 | 3
  flip: boolean
  cells: Cell[]
}

const key = (cells: readonly Cell[]) => cells.map(([r, c]) => `${r},${c}`).join(';')

/** Every distinct shape a piece can take, with one rotation/flip that produces it. */
export function orientations(cells: readonly Cell[]): Orientation[] {
  const seen = new Set<string>()
  const out: Orientation[] = []
  for (const flip of [false, true]) {
    for (const rot of [0, 1, 2, 3] as const) {
      const oriented = orient(cells, rot, flip)
      const k = key(oriented)
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ rot, flip, cells: oriented })
    }
  }
  return out
}

export function bounds(cells: readonly Cell[]): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const [r, c] of cells) {
    if (r + 1 > rows) rows = r + 1
    if (c + 1 > cols) cols = c + 1
  }
  return { rows, cols }
}

/** Rotate a point a quarter turn around `pivot`; dir 1 is clockwise on screen. */
export function rotatePoint(p: Point, pivot: Point, dir: 1 | -1): Point {
  const dx = p.x - pivot.x
  const dy = p.y - pivot.y
  return dir === 1 ? { x: pivot.x - dy, y: pivot.y + dx } : { x: pivot.x + dy, y: pivot.y - dx }
}

/** Reflect a point across the vertical line x = pivotX. */
export function mirrorPoint(p: Point, pivotX: number): Point {
  return { x: 2 * pivotX - p.x, y: p.y }
}
