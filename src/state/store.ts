import { create } from 'zustand'
import { bounds, mod, type Cell, type Point } from '../game/geometry'
import { deal, tableLayout, type Home, type TableLayout } from '../game/layout'
import { PIECE_IDS, type PieceId } from '../game/pieces'
import type { Rect } from '../game/placement'
import { boxAround, intoRoom, type Room } from '../game/room'
import { cellSquares, overlapping, type Drawn } from '../game/stacking'
import {
  answerFor,
  cellsOnBoard,
  centerOf,
  dropAt,
  flip,
  hint,
  shapeOf,
  status,
  turn,
  type PieceMap,
  type PieceState,
  type Pose,
} from '../game/state'

/** How a piece should animate to its new state. */
export type Motion =
  | { kind: 'settle' }
  | { kind: 'turn'; pivot: Point; dir: 1 | -1 }
  | { kind: 'flip'; pivot: Point }
  | { kind: 'travel'; delay: number }
  | { kind: 'jump' }

export interface TablePiece extends PieceState {
  /** Stacking order 0–9, in or out of the board; the last piece touched is on top. */
  z: number
  /** Resting angle in degrees for loose pieces (purely cosmetic). */
  tilt: number
  motion: Motion
}

export type TargetChoice = { kind: 'today' } | { kind: 'date'; y: number; m: number; d: number }

/**
 * May the player pick which day to make? Not for now: the game is one puzzle a day, today's.
 * Turned back on, this brings back the date in the top bar (with its calendar) and 接着拼下一天
 * on a finished board.
 */
export const PICK_ANY_DAY: boolean = false

export interface Notice {
  id: number
  text: string
}

export interface GameState {
  pieces: Record<PieceId, TablePiece>
  /** How the table is laid out on this screen. */
  layout: TableLayout
  /**
   * Where a loose piece may lie on this screen: anywhere in the window short of its edges, which
   * takes in the mat, the table round it and the empty stretch of the top bar, but not on what is
   * written in the bar.
   */
  room: Room
  target: TargetChoice
  activeId: PieceId | null
  draggingId: PieceId | null
  /** Cells the dragged piece would drop into. */
  ghost: Cell[] | null
  /** A piece to wiggle so the player notices it. */
  attention: { id: PieceId; seq: number } | null
  notice: Notice | null
  startedAt: number | null
  finishedAt: number | null
  usedAnswer: boolean
}

export interface GameActions {
  /** Lay the table out for this window, with `room` for loose pieces (just the mat, if that is not said). */
  setLayout(layout: TableLayout, room?: Room): void
  activate(id: PieceId | null): void
  pickUp(id: PieceId): void
  setGhost(cells: Cell[] | null): void
  /** Let go of the dragged piece with its box's top-left at `topLeft`. Returns true if it went into the board. */
  release(id: PieceId, topLeft: Point): boolean
  /** Turn or flip the piece in hand; its position is owned by the drag until release. */
  reorientInHand(id: PieceId, change: 1 | -1 | 'flip'): void
  turnPiece(id: PieceId, dir: 1 | -1, pivot: Point): void
  flipPiece(id: PieceId, pivot: Point): void
  /** Bring a piece out from under any lying on it, to the top. Returns false, changing nothing, if none do. */
  raise(id: PieceId): boolean
  resetAll(): void
  showHint(): void
  showAnswer(): void
  /** Make another day. A different day is a fresh start: every piece goes back to the tray. */
  setTarget(target: TargetChoice): void
  markFinished(): void
  say(text: string): void
}

export type Store = GameState & GameActions

/**
 * When the page was opened. "Today" is the day that fell on for as long as the page stays open:
 * the day to make does not move on at midnight, only when the page is loaded again.
 */
const OPENED = new Date()

export function targetDate(target: TargetChoice, now = OPENED): Date {
  return target.kind === 'today'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(target.y, target.m - 1, target.d)
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** The target for making `date`: plain "today" if that is the day the page was opened on, pinned otherwise. */
export function targetFor(date: Date, now = OPENED): TargetChoice {
  return dayKey(date) === dayKey(now)
    ? { kind: 'today' }
    : { kind: 'date', y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

const randomTilt = () => (Math.random() * 2 - 1) * 3.5

/** The turn count equivalent to `goal` (mod 4) that is closest to `current`. */
function nearestTurns(current: number, goal: number): number {
  const delta = mod(goal - current, 4)
  return current + (delta > 2 ? delta - 4 : delta)
}

/** Restack so `ids` end up on top, in that order. Stacking numbers stay 0–9. */
function raised(pieces: Record<PieceId, TablePiece>, ...ids: PieceId[]): Record<PieceId, TablePiece> {
  const order = PIECE_IDS.filter((id) => !ids.includes(id))
    .sort((a, b) => pieces[a].z - pieces[b].z)
    .concat(ids)
  const next = { ...pieces }
  order.forEach((id, z) => {
    if (next[id].z !== z) next[id] = { ...next[id], z }
  })
  return next
}

/** A piece laid in the tray as dealt, turned there the short way round and face up. */
function laidAt(p: TablePiece, home: Home): TablePiece {
  return {
    ...p,
    turns: nearestTurns(p.turns, home.turns),
    flips: Math.round(p.flips / 2) * 2,
    spot: { kind: 'loose', x: home.x, y: home.y },
    tilt: home.tilt,
  }
}

/** Every piece scattered over the tray afresh: a new random spot and turn for each, every time. */
function dealPieces(layout: TableLayout, from?: Record<PieceId, TablePiece>, stagger = false): Record<PieceId, TablePiece> {
  const homes = deal(layout)
  const pieces = {} as Record<PieceId, TablePiece>
  PIECE_IDS.forEach((id, i) => {
    const prev = from?.[id]
    const home = homes[id]
    pieces[id] = prev
      ? { ...laidAt(prev, home), motion: { kind: 'travel', delay: stagger ? i * 0.035 : 0 } }
      : {
          id,
          turns: home.turns,
          flips: 0,
          spot: { kind: 'loose', x: home.x, y: home.y },
          z: i,
          tilt: home.tilt,
          motion: { kind: 'jump' },
        }
  })
  return pieces
}

const plain = (pieces: Record<PieceId, TablePiece>): PieceMap => pieces

/** The piece as drawn: pieces lying in a phone's tray are drawn smaller. */
function drawn(p: TablePiece, layout: TableLayout): Drawn {
  return { ...p, scale: p.spot.kind === 'loose' && layout.inTray(centerOf(p)) ? layout.trayScale : 1 }
}

/**
 * Keep a loose piece in the room there is for it, moving it no further than that takes. It is
 * measured as it is drawn, cell by cell: at the slight angle it rests at, and smaller in a
 * phone's tray. So what is seen of it ends just at the limit, however it lies.
 */
function onTable(p: TablePiece, layout: TableLayout, room: Room): TablePiece {
  if (p.spot.kind !== 'loose') return p
  const by = intoRoom(cellSquares(drawn(p, layout)).map(boxAround), room)
  if (by.x === 0 && by.y === 0) return p
  return { ...p, spot: { kind: 'loose', x: p.spot.x + by.x, y: p.spot.y + by.y } }
}

/** The room there is before the table has measured its window: the mat, with nothing written over it. */
const matOf = (layout: TableLayout): Room => ({ within: layout.mat, clear: [] })

const sameRect = (a: Rect, b: Rect) => a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom

/** Place a loose piece so its centre stays put after its box changes shape. */
function recentre(p: TablePiece, center: Point): TablePiece {
  const { rows, cols } = bounds(shapeOf(p))
  return { ...p, spot: { kind: 'loose', x: center.x - cols / 2, y: center.y - rows / 2 } }
}

// Nothing is kept from one visit to the next: opening the page, or loading it again, is a new game.
// The table lays itself out for the window as soon as it has measured it (setLayout).
const firstLayout = tableLayout('wide')
let noticeSeq = 0
let attentionSeq = 0

export const useGame = create<Store>()((set, get) => {
  /** Apply a pure rules update to one piece, keeping its table extras, and bring it to the top. */
  const update = (id: PieceId, next: PieceMap, extra: Partial<TablePiece>) => {
    const pieces = get().pieces
    const moved = onTable({ ...pieces[id], ...next[id], ...extra }, get().layout, get().room)
    set({ pieces: raised({ ...pieces, [id]: moved }, id) })
  }
  const begin = () => {
    if (get().startedAt === null) set({ startedAt: Date.now() })
  }
  const placePose = (id: PieceId, pose: Pose, delay: number): TablePiece => ({
    ...get().pieces[id],
    turns: pose.turns,
    flips: pose.flips,
    spot: { kind: 'board', row: pose.row, col: pose.col },
    tilt: 0,
    motion: { kind: 'travel', delay },
  })

  return {
    pieces: dealPieces(firstLayout),
    layout: firstLayout,
    room: matOf(firstLayout),
    target: { kind: 'today' },
    activeId: null,
    draggingId: null,
    ghost: null,
    attention: null,
    notice: null,
    startedAt: null,
    finishedAt: null,
    usedAnswer: false,

    setLayout(layout, room = matOf(layout)) {
      const prev = get().layout
      if (layout === prev) {
        if (room === get().room) return
        // The same table with other room on it: whatever no longer lies in the room is brought back
        // into it. In a window of another size that is done at once, as all the table moves then.
        // If only the words in the bar have changed (a button asking its question is wider for it),
        // a piece they now reach slides out from under them.
        const motion: Motion = { kind: sameRect(room.within, get().room.within) ? 'settle' : 'jump' }
        const pieces = { ...get().pieces }
        let moved = false
        for (const id of PIECE_IDS) {
          const kept = onTable(pieces[id], layout, room)
          if (kept === pieces[id]) continue
          pieces[id] = { ...kept, motion }
          moved = true
        }
        set(moved ? { room, pieces } : { room })
        return
      }
      const pieces = { ...get().pieces }
      const homes = layout.key === prev.key ? null : deal(layout)
      for (const id of PIECE_IDS) {
        const p = pieces[id]
        if (p.spot.kind === 'board') continue
        if (!homes) {
          // The same tray at another size: loose pieces keep their place relative to it.
          const c = centerOf(p)
          const k = layout.trayScale / prev.trayScale
          const at = prev.inTray(c)
            ? { x: layout.trayOrigin.x + (c.x - prev.trayOrigin.x) * k, y: layout.trayOrigin.y + (c.y - prev.trayOrigin.y) * k }
            : c
          pieces[id] = onTable({ ...recentre(p, at), motion: { kind: 'jump' } }, layout, room)
        } else {
          // A different tray (the screen turned): the loose pieces are dealt into it afresh.
          pieces[id] = { ...laidAt(p, homes[id]), motion: { kind: 'jump' } }
        }
      }
      set({ layout, room, pieces })
    },

    activate(id) {
      if (get().activeId !== id) set({ activeId: id })
    },

    pickUp(id) {
      begin()
      const p = get().pieces[id]
      set({
        draggingId: id,
        activeId: id,
        pieces: raised({ ...get().pieces, [id]: { ...p, tilt: 0 } }, id),
      })
    },

    setGhost(cells) {
      const prev = get().ghost
      if (prev === cells || (prev && cells && prev.join() === cells.join())) return
      set({ ghost: cells })
    },

    release(id, topLeft) {
      const next = dropAt(plain(get().pieces), id, topLeft)
      const placed = next[id].spot.kind === 'board'
      update(id, next, { tilt: placed ? 0 : randomTilt(), motion: { kind: 'settle' } })
      set({ draggingId: null, ghost: null })
      return placed
    },

    reorientInHand(id, change) {
      const p = get().pieces[id]
      const flipped = mod(p.flips, 2) === 1
      const next =
        change === 'flip' ? { flips: p.flips + 1 } : { turns: p.turns + (flipped ? -change : change) }
      set({ pieces: { ...get().pieces, [id]: { ...p, ...next } } })
    },

    turnPiece(id, dir, pivot) {
      begin()
      const next = turn(plain(get().pieces), id, dir, pivot)
      const p = get().pieces[id]
      update(id, next, { tilt: next[id].spot.kind === 'board' ? 0 : p.tilt, motion: { kind: 'turn', pivot, dir } })
    },

    flipPiece(id, pivot) {
      begin()
      const next = flip(plain(get().pieces), id, pivot)
      const p = get().pieces[id]
      update(id, next, { tilt: next[id].spot.kind === 'board' ? 0 : p.tilt, motion: { kind: 'flip', pivot } })
    },

    raise(id) {
      const { pieces, layout } = get()
      const piece = drawn(pieces[id], layout)
      const under = PIECE_IDS.some(
        (other) => pieces[other].z > pieces[id].z && overlapping(piece, drawn(pieces[other], layout)),
      )
      if (under) set({ pieces: raised(pieces, id) })
      return under
    },

    resetAll() {
      set({
        pieces: dealPieces(get().layout, get().pieces, true),
        startedAt: null,
        finishedAt: null,
        usedAnswer: false,
        activeId: null,
        notice: null,
      })
    },

    showHint() {
      const { pieces, target } = get()
      const date = targetDate(target)
      const recent = [...PIECE_IDS].sort((a, b) => pieces[b].z - pieces[a].z)
      const h = hint(plain(pieces), date, recent)
      begin()
      switch (h.kind) {
        case 'done':
          get().say('已经拼好了')
          break
        case 'covering':
          set({ attention: { id: h.ids[0], seq: ++attentionSeq } })
          get().say('这块盖住了要露出的日期，先把它挪开')
          break
        case 'blocking':
          set({ attention: { id: h.id, seq: ++attentionSeq } })
          get().say('这块放在这里就拼不完了，挪开试试')
          break
        case 'stuck':
          get().say('现在的摆法拼不完，收回几块再试试')
          break
        case 'place':
          set({ pieces: raised({ ...pieces, [h.id]: placePose(h.id, h, 0) }, h.id), activeId: h.id })
          break
      }
    },

    showAnswer() {
      const { pieces, target } = get()
      const date = targetDate(target)
      if (status(plain(pieces), date).solved) {
        get().say('已经拼好了')
        return
      }
      const answer = answerFor(plain(pieces), date)
      if (!answer) return
      begin()
      const next = { ...pieces }
      const flying: PieceId[] = []
      // Fly the pieces in from the top of the board down.
      const order = [...PIECE_IDS].sort((a, b) => answer[a].row - answer[b].row || answer[a].col - answer[b].col)
      order.forEach((id, i) => {
        const goal = { ...pieces[id], ...answer[id], spot: { kind: 'board' as const, row: answer[id].row, col: answer[id].col } }
        const same = pieces[id].spot.kind === 'board' && cellsOnBoard(pieces[id])!.join() === cellsOnBoard(goal)!.join()
        if (same) return
        next[id] = placePose(id, answer[id], i * 0.09)
        flying.push(id)
      })
      set({ pieces: raised(next, ...flying), usedAnswer: true, activeId: null })
    },

    setTarget(target) {
      const changed = dayKey(targetDate(target)) !== dayKey(targetDate(get().target))
      set({ target })
      if (changed) get().resetAll()
    },

    markFinished() {
      if (get().finishedAt === null) set({ finishedAt: Date.now() })
    },

    say(text) {
      set({ notice: { id: ++noticeSeq, text } })
    },
  }
})
