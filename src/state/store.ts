import { create } from 'zustand'
import { bounds, mod, type Cell, type Point } from '../game/geometry'
import { tableLayout, type TableLayout } from '../game/layout'
import { PIECE_IDS, type PieceId } from '../game/pieces'
import { overlapping, type Drawn } from '../game/stacking'
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
import { flushSave, loadSaved, save } from './persist'

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

export interface Notice {
  id: number
  text: string
}

export interface GameState {
  pieces: Record<PieceId, TablePiece>
  /** How the table is laid out on this screen. */
  layout: TableLayout
  target: TargetChoice
  /** The day (see dayKey) the timer and the answer flag belong to. */
  timerDay: string | null
  activeId: PieceId | null
  draggingId: PieceId | null
  /** Cells the dragged piece would drop into. */
  ghost: Cell[] | null
  /** A piece to wiggle so the player notices it. */
  attention: { id: PieceId; seq: number } | null
  notice: Notice | null
  sound: boolean
  startedAt: number | null
  finishedAt: number | null
  usedAnswer: boolean
}

export interface GameActions {
  setLayout(layout: TableLayout): void
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
  /** Called with the current target day; a new day starts a new timer. */
  trackTarget(day: string): void
  toggleSound(): void
  markFinished(): void
  say(text: string): void
}

export type Store = GameState & GameActions

export function targetDate(target: TargetChoice, now = new Date()): Date {
  return target.kind === 'today'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(target.y, target.m - 1, target.d)
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** The target for making `date`: following the clock if it is today, pinned otherwise. */
export function targetFor(date: Date, now = new Date()): TargetChoice {
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

function homePieces(layout: TableLayout, from?: Record<PieceId, TablePiece>, stagger = false): Record<PieceId, TablePiece> {
  const pieces = {} as Record<PieceId, TablePiece>
  let travelling = 0
  PIECE_IDS.forEach((id, i) => {
    const prev = from?.[id]
    const home = layout.homes[id]
    // Untwist to the nearest matching pose, face up, rather than spinning all the way back.
    const turns = prev ? nearestTurns(prev.turns, home.turns) : home.turns
    const flips = prev ? Math.round(prev.flips / 2) * 2 : 0
    const tilt = layout.tilts[id]
    // One already lying at home stays put, rather than being picked up and set down again.
    const atHome =
      prev?.spot.kind === 'loose' &&
      Math.abs(prev.spot.x - home.x) < 1e-6 &&
      Math.abs(prev.spot.y - home.y) < 1e-6 &&
      prev.turns === turns &&
      prev.flips === flips &&
      prev.tilt === tilt
    pieces[id] = atHome
      ? prev
      : {
          id,
          turns,
          flips,
          spot: { kind: 'loose', x: home.x, y: home.y },
          z: prev?.z ?? i,
          tilt,
          motion: from ? { kind: 'travel', delay: stagger ? travelling++ * 0.035 : 0 } : { kind: 'jump' },
        }
  })
  return pieces
}

const plain = (pieces: Record<PieceId, TablePiece>): PieceMap => pieces

/** Keep a loose piece on the table, as drawn (pieces in a phone's tray are drawn smaller). */
function onTable(p: TablePiece, layout: TableLayout): TablePiece {
  if (p.spot.kind !== 'loose') return p
  const { rows, cols } = bounds(shapeOf(p))
  const center = { x: p.spot.x + cols / 2, y: p.spot.y + rows / 2 }
  const s = layout.inTray(center) ? layout.trayScale : 1
  const { mat } = layout
  const cx = Math.min(Math.max(center.x, mat.left + (cols * s) / 2), mat.right - (cols * s) / 2)
  const cy = Math.min(Math.max(center.y, mat.top + (rows * s) / 2), mat.bottom - (rows * s) / 2)
  if (cx === center.x && cy === center.y) return p
  return { ...p, spot: { kind: 'loose', x: cx - cols / 2, y: cy - rows / 2 } }
}

/** The piece as drawn: pieces lying in a phone's tray are drawn smaller. */
function drawn(p: TablePiece, layout: TableLayout): Drawn {
  return { ...p, scale: p.spot.kind === 'loose' && layout.inTray(centerOf(p)) ? layout.trayScale : 1 }
}

/** Place a loose piece so its centre stays put after its box changes shape. */
function recentre(p: TablePiece, center: Point): TablePiece {
  const { rows, cols } = bounds(shapeOf(p))
  return { ...p, spot: { kind: 'loose', x: center.x - cols / 2, y: center.y - rows / 2 } }
}

const initial = loadSaved()
const firstLayout = initial?.layout
  ? tableLayout(initial.layout.mode, initial.layout.arrangement, initial.layout.scale)
  : tableLayout('wide')
let noticeSeq = 0
let attentionSeq = 0

export const useGame = create<Store>()((set, get) => {
  /** Apply a pure rules update to one piece, keeping its table extras, and bring it to the top. */
  const update = (id: PieceId, next: PieceMap, extra: Partial<TablePiece>) => {
    const pieces = get().pieces
    const moved = onTable({ ...pieces[id], ...next[id], ...extra }, get().layout)
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
    pieces: initial?.pieces ?? homePieces(firstLayout),
    layout: firstLayout,
    target: initial?.target ?? { kind: 'today' },
    timerDay: initial?.timerDay ?? null,
    activeId: null,
    draggingId: null,
    ghost: null,
    attention: null,
    notice: null,
    sound: initial?.sound ?? true,
    startedAt: initial?.startedAt ?? null,
    finishedAt: initial?.finishedAt ?? null,
    usedAnswer: initial?.usedAnswer ?? false,

    setLayout(layout) {
      const prev = get().layout
      if (layout === prev) return
      const pieces = { ...get().pieces }
      for (const id of PIECE_IDS) {
        const p = pieces[id]
        if (p.spot.kind === 'board') continue
        if (layout.key === prev.key) {
          // The same arrangement at another size: loose pieces keep their place relative to the tray.
          const c = centerOf(p)
          const k = layout.trayScale / prev.trayScale
          const at = prev.inTray(c)
            ? { x: layout.trayOrigin.x + (c.x - prev.trayOrigin.x) * k, y: layout.trayOrigin.y + (c.y - prev.trayOrigin.y) * k }
            : c
          pieces[id] = onTable({ ...recentre(p, at), motion: { kind: 'jump' } }, layout)
        } else {
          // A different arrangement (the screen turned): loose pieces go to their new places.
          const home = layout.homes[id]
          const box = bounds(shapeOf({ id, turns: home.turns, flips: 0 }))
          const at = { x: home.x + box.cols / 2, y: home.y + box.rows / 2 }
          pieces[id] = { ...recentre(p, at), tilt: layout.tilts[id], motion: { kind: 'jump' } }
        }
      }
      set({ layout, pieces })
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
        pieces: homePieces(get().layout, get().pieces, true),
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

    trackTarget(day) {
      if (get().timerDay !== day) set({ timerDay: day, startedAt: null, finishedAt: null, usedAnswer: false })
    },

    toggleSound() {
      set({ sound: !get().sound })
    },

    markFinished() {
      if (get().finishedAt === null) set({ finishedAt: Date.now() })
    },

    say(text) {
      set({ notice: { id: ++noticeSeq, text } })
    },
  }
})

useGame.subscribe((state) => save(state))
if (typeof window !== 'undefined') {
  // Don't lose the last move when the tab is closed or hidden right after it.
  window.addEventListener('pagehide', flushSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave()
  })
}
