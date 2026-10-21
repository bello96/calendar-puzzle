import { bounds, orient, type Point } from './geometry'
import { PIECE_BY_ID, PIECE_IDS, type PieceId } from './pieces'
import type { Rect } from './placement'
import { scatter } from './scatter'

/**
 * The wooden board's outline in cells, measured from the photos, with (0, 0)
 * at the top-left of the cut-out. The upper two rows are one cell narrower,
 * which gives the board its notch at the top right. The top edge, which
 * carries the title, is a little wider than on the real board and the bottom
 * one as narrow as the sides, so the frame looks even.
 */
export const FRAME = {
  left: -0.48,
  top: -0.64,
  right: 7.5,
  bottom: 8.48,
  /** Right edge beside the month rows. */
  notchX: 6.42,
  /** Where the board widens again, just above row 2. */
  notchY: 1.45,
  radius: 0.3,
} as const

export type LayoutMode = 'wide' | 'tall'

/** Where a piece is dealt to: top-left of its full-size box, how it is turned, and its resting angle in degrees. */
export interface Home extends Point {
  turns: number
  tilt: number
}

/** The tray's shape: 'block' is 11 × 9, as tall as the board; 'strip' is 15 × 7.5, for below the board on a phone. */
export type ArrangementName = 'block' | 'strip'

export interface TableLayout {
  mode: LayoutMode
  arrangement: ArrangementName
  /** Same for every size of the same tray, so a real change of tray can be noticed. */
  key: string
  /** The visible table, in cells. */
  mat: Rect
  /** The area the loose pieces are dealt into. */
  tray: Rect
  /** Pieces lying in the tray are drawn at this size, so a phone can show them all. */
  trayScale: number
  /** Top-left of the tray; positions in it scale from here. */
  trayOrigin: Point
  /** The tray's size in full-size cells, before scaling. */
  traySize: { width: number; height: number }
  /** Is a piece centred here lying in the tray (and so drawn at tray size)? */
  inTray(center: Point): boolean
}

const TRAYS: Record<ArrangementName, { width: number; height: number }> = {
  block: { width: 11, height: 9 },
  strip: { width: 15, height: 7.5 },
}

const PAD = 0.9
const MIN_CELL = 26
const MAX_CELL = 92

/**
 * Board and tray side by side ('wide') or stacked ('tall'), with the tray
 * shaped as `arrangement` and the pieces in it drawn at `scale`.
 */
export function tableLayout(
  mode: LayoutMode,
  arrangement: ArrangementName = mode === 'wide' ? 'block' : 'strip',
  scale = mode === 'wide' ? 1 : 0.54,
): TableLayout {
  const { width, height } = TRAYS[arrangement]
  const boardW = FRAME.right - FRAME.left
  const boardH = FRAME.bottom - FRAME.top
  const trayW = width * scale
  const trayH = height * scale
  const origin =
    mode === 'wide'
      ? { x: FRAME.right + 1.4, y: FRAME.top + (boardH - trayH) / 2 }
      : { x: FRAME.left + (boardW - trayW) / 2, y: FRAME.bottom + 0.8 }

  const slack = 0.1 * scale // a tilted piece's corners may reach a little past its box
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
    traySize: { width, height },
    inTray: mode === 'wide' ? (c) => c.x > FRAME.right + 0.25 : (c) => c.y > FRAME.bottom + 0.25,
  }
}

/** Spread the pieces over the layout's tray afresh, each in a random spot and turned at random. */
export function deal(layout: TableLayout, rand: () => number = Math.random): Record<PieceId, Home> {
  const { traySize, trayOrigin, trayScale: s } = layout
  const lies = scatter(traySize.width, traySize.height, rand)
  const homes = {} as Record<PieceId, Home>
  for (const id of PIECE_IDS) {
    const { cx, cy, turns, tilt } = lies[id]
    const { rows, cols } = bounds(orient(PIECE_BY_ID[id].cells, turns, false))
    homes[id] = { x: trayOrigin.x + cx * s - cols / 2, y: trayOrigin.y + cy * s - rows / 2, turns, tilt }
  }
  return homes
}

// Every layout worth considering: side by side, or stacked with either tray at a range of sizes.
const CANDIDATES: TableLayout[] = [
  tableLayout('wide'),
  ...(['block', 'strip'] as const).flatMap((arrangement) =>
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
