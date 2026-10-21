import { isBoardCell } from '../game/board'
import type { ArrangementName, LayoutMode } from '../game/layout'
import { PIECE_IDS, type PieceId } from '../game/pieces'
import { cellsOnBoard, type Spot } from '../game/state'
import type { GameState, TablePiece, TargetChoice } from './store'

const KEY = 'calendar-puzzle:v1'
const VERSION = 1

/** Enough to rebuild the layout the loose pieces were laid out for. */
export interface LayoutSpec {
  mode: LayoutMode
  arrangement: ArrangementName
  scale: number
}

export interface Saved
  extends Pick<GameState, 'pieces' | 'target' | 'sound' | 'startedAt' | 'finishedAt' | 'usedAnswer' | 'timerDay'> {
  layout: LayoutSpec | null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isInt = (v: unknown): v is number => Number.isInteger(v)

/** Parsed JSON of unknown shape; every field is checked before it is used. */
type Raw = any

function parseSpot(s: Raw): Spot | null {
  if (s?.kind === 'board' && isInt(s.row) && isInt(s.col)) return { kind: 'board', row: s.row, col: s.col }
  if (s?.kind === 'loose' && isNum(s.x) && isNum(s.y)) return { kind: 'loose', x: s.x, y: s.y }
  return null
}

function parsePiece(id: PieceId, raw: Raw): TablePiece | null {
  if (raw?.id !== id || !isInt(raw.turns) || !isInt(raw.flips) || !isNum(raw.z) || !isNum(raw.tilt)) return null
  const spot = parseSpot(raw.spot)
  if (!spot) return null
  return { id, turns: raw.turns, flips: raw.flips, spot, z: raw.z, tilt: raw.tilt, motion: { kind: 'jump' } }
}

function parseTarget(raw: Raw): TargetChoice | null {
  if (raw?.kind === 'today') return { kind: 'today' }
  if (raw?.kind !== 'date' || !isInt(raw.y) || !isInt(raw.m) || !isInt(raw.d)) return null
  const date = new Date(raw.y, raw.m - 1, raw.d)
  const real = date.getFullYear() === raw.y && date.getMonth() === raw.m - 1 && date.getDate() === raw.d
  return real ? { kind: 'date', y: raw.y, m: raw.m, d: raw.d } : null
}

function parseLayout(raw: Raw): LayoutSpec | null {
  const modeOk = raw?.mode === 'wide' || raw?.mode === 'tall'
  const arrangementOk = raw?.arrangement === 'block' || raw?.arrangement === 'strip'
  if (!modeOk || !arrangementOk || !isNum(raw.scale) || raw.scale <= 0 || raw.scale > 1) return null
  return { mode: raw.mode, arrangement: raw.arrangement, scale: raw.scale }
}

/** Read a saved table, or null if anything about it is off (then the game starts fresh). */
export function parseSaved(json: string): Saved | null {
  let data: Raw
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (data?.version !== VERSION) return null

  const pieces = {} as Record<PieceId, TablePiece>
  const taken = new Set<string>()
  for (const id of PIECE_IDS) {
    const piece = parsePiece(id, data.pieces?.[id])
    if (!piece) return null
    for (const [r, c] of cellsOnBoard(piece) ?? []) {
      const key = `${r},${c}`
      if (!isBoardCell(r, c) || taken.has(key)) return null
      taken.add(key)
    }
    pieces[id] = piece
  }
  // Keep the stacking order but number it 0–9 again.
  ;[...PIECE_IDS]
    .sort((a, b) => pieces[a].z - pieces[b].z)
    .forEach((id, z) => (pieces[id] = { ...pieces[id], z }))

  const target = parseTarget(data.target)
  if (!target) return null
  const time = (v: unknown) => (isNum(v) ? v : null)
  return {
    pieces,
    layout: parseLayout(data.layout),
    target,
    sound: data.sound !== false,
    startedAt: time(data.startedAt),
    finishedAt: time(data.finishedAt),
    usedAnswer: data.usedAnswer === true,
    timerDay: typeof data.timerDay === 'string' ? data.timerDay : null,
  }
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? parseSaved(raw) : null
  } catch {
    return null
  }
}

let pending: GameState | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function write(state: GameState): void {
  const pieces = Object.fromEntries(
    PIECE_IDS.map((id) => {
      const { turns, flips, spot, z, tilt } = state.pieces[id]
      return [id, { id, turns, flips, spot, z, tilt }]
    }),
  )
  const { target, sound, startedAt, finishedAt, usedAnswer, timerDay } = state
  const layout: LayoutSpec = { mode: state.layout.mode, arrangement: state.layout.arrangement, scale: state.layout.trayScale }
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, pieces, layout, target, sound, startedAt, finishedAt, usedAnswer, timerDay }),
    )
  } catch {
    // Storage full or blocked: progress just won't survive a reload.
  }
}

/** Save shortly after the last change. */
export function save(state: GameState): void {
  pending = state
  clearTimeout(timer)
  timer = setTimeout(flushSave, 250)
}

/** Save now, e.g. because the page is being hidden or closed. */
export function flushSave(): void {
  clearTimeout(timer)
  if (pending) write(pending)
  pending = null
}
