import { bounds, orient, type Point } from './geometry'
import { PIECE_BY_ID, PIECE_IDS, type PieceId } from './pieces'
import type { Rect } from './placement'

/**
 * The wooden board's outline in cells, measured from the photos, with (0, 0)
 * at the top-left of the cut-out. The upper two rows are one cell narrower,
 * which gives the board its notch at the top right.
 */
export const FRAME = {
  left: -0.48,
  top: -0.48,
  right: 7.5,
  bottom: 8.57,
  /** Right edge beside the month rows. */
  notchX: 6.42,
  /** Where the board widens again, just above row 2. */
  notchY: 1.45,
  radius: 0.3,
} as const

export type LayoutMode = 'wide' | 'tall'

/** Where a piece first lies: top-left of its full-size box, and how it is turned. */
export interface Home extends Point {
  turns: number
}

export type ArrangementName = 'rows3' | 'rows2'

export interface TableLayout {
  mode: LayoutMode
  arrangement: ArrangementName
  /** Same for every size of the same arrangement, so a real change of arrangement can be noticed. */
  key: string
  /** The visible table, in cells. */
  mat: Rect
  /** The area the loose pieces start in. */
  tray: Rect
  /** Pieces lying in the tray are drawn at this size, so a phone can show them all. */
  trayScale: number
  /** Top-left of the arrangement; tray positions scale from here. */
  trayOrigin: Point
  homes: Record<PieceId, Home>
  /** A slight resting angle for each piece, so the pile looks scattered. */
  tilts: Record<PieceId, number>
  /** Is a piece centred here lying in the tray (and so drawn at tray size)? */
  inTray(center: Point): boolean
}

/** Piece centres in full-size cells from the tray's top-left, with the quarter turns each lies at. */
interface Arrangement {
  width: number
  height: number
  spots: Record<PieceId, [turns: number, cx: number, cy: number]>
}

// Three rows in an 11 × 9 tray, as tall as the board.
const ROWS3: Arrangement = {
  width: 11,
  height: 9,
  spots: {
    T5: [0, 1.5, 1.5],
    V5: [0, 5, 1.5],
    Z5: [0, 8.5, 1.5],
    P5: [0, 1, 5],
    L4: [1, 3.5, 5],
    S4: [1, 6, 5],
    U5: [1, 8.5, 5],
    I4: [1, 10.5, 5.5],
    L5: [0, 2, 8],
    N5: [0, 6.5, 8],
  },
}

// Two long rows, for below the board on a phone.
const ROWS2: Arrangement = {
  width: 15,
  height: 7.5,
  spots: {
    T5: [0, 1.5, 1.5],
    V5: [0, 5, 1.5],
    Z5: [0, 8.5, 1.5],
    P5: [0, 11.5, 1.5],
    L4: [1, 14, 1.5],
    L5: [0, 2, 4.5],
    N5: [0, 6.5, 4.5],
    S4: [1, 10, 5],
    U5: [1, 12.5, 5],
    I4: [1, 14.5, 5.5],
  },
}

// Small fixed nudges and resting angles so the pieces look dropped rather than filed.
const SCATTER: Record<PieceId, [dx: number, dy: number, tilt: number]> = {
  I4: [0.06, -0.05, -2.5],
  L4: [-0.07, 0.05, 3],
  S4: [0.08, 0.06, -2],
  L5: [-0.05, -0.06, 2],
  N5: [0.07, 0.04, -3],
  P5: [-0.08, 0.07, 2.5],
  T5: [0.04, -0.08, -2],
  U5: [-0.06, -0.04, 2.5],
  V5: [0.08, 0.07, -3],
  Z5: [-0.04, 0.08, 1.5],
}

const PAD = 0.9
const MIN_CELL = 26
const MAX_CELL = 92

/**
 * Board and tray side by side ('wide') or stacked ('tall'), with the pieces
 * in the tray set out in `arrangement` and drawn at `scale`.
 */
export function tableLayout(
  mode: LayoutMode,
  arrangement: ArrangementName = mode === 'wide' ? 'rows3' : 'rows2',
  scale = mode === 'wide' ? 1 : 0.54,
): TableLayout {
  const { width, height, spots } = arrangement === 'rows3' ? ROWS3 : ROWS2
  const boardW = FRAME.right - FRAME.left
  const boardH = FRAME.bottom - FRAME.top
  const trayW = width * scale
  const trayH = height * scale
  const origin =
    mode === 'wide'
      ? { x: FRAME.right + 1.4, y: FRAME.top + (boardH - trayH) / 2 }
      : { x: FRAME.left + (boardW - trayW) / 2, y: FRAME.bottom + 0.8 }

  const homes = {} as Record<PieceId, Home>
  const tilts = {} as Record<PieceId, number>
  for (const id of PIECE_IDS) {
    const [turns, cx, cy] = spots[id]
    const [dx, dy, tilt] = SCATTER[id]
    const { rows, cols } = bounds(orient(PIECE_BY_ID[id].cells, turns, false))
    const center = { x: origin.x + (cx + dx) * scale, y: origin.y + (cy + dy) * scale }
    homes[id] = { x: center.x - cols / 2, y: center.y - rows / 2, turns }
    tilts[id] = tilt
  }

  const slack = 0.1 * scale // room for the scatter nudges
  const tray = { left: origin.x - slack, top: origin.y - slack, right: origin.x + trayW + slack, bottom: origin.y + trayH + slack }
  return {
    mode,
    arrangement,
    key: `${mode}-${arrangement}`,
    mat: {
      left: Math.min(FRAME.left, tray.left) - PAD,
      top: FRAME.top - PAD,
      right: Math.max(FRAME.right, tray.right) + PAD,
      bottom: Math.max(FRAME.bottom, tray.bottom) + PAD,
    },
    tray,
    trayScale: scale,
    trayOrigin: origin,
    homes,
    tilts,
    inTray: mode === 'wide' ? (c) => c.x > FRAME.right + 0.25 : (c) => c.y > FRAME.bottom + 0.25,
  }
}

// Every layout worth considering: side by side, or stacked with either tray arrangement at a range of sizes.
const CANDIDATES: TableLayout[] = [
  tableLayout('wide'),
  ...(['rows3', 'rows2'] as const).flatMap((arrangement) =>
    Array.from({ length: 36 }, (_, i) => tableLayout('tall', arrangement, +(0.45 + i * 0.01).toFixed(2))),
  ),
]

/**
 * The layout that shows the board and the tray biggest in the space
 * available (weighing the board most), and its cell size in px.
 */
export function chooseLayout(width: number, height: number): { layout: TableLayout; cell: number } {
  const fit = (l: TableLayout) => Math.min(width / (l.mat.right - l.mat.left), height / (l.mat.bottom - l.mat.top))
  let layout = CANDIDATES[0]
  let best = -1
  for (const candidate of CANDIDATES) {
    const score = fit(candidate) * (1 + 0.6 * candidate.trayScale)
    if (score > best) {
      best = score
      layout = candidate
    }
  }
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(fit(layout))))
  return { layout, cell }
}
