import type { Cell } from './geometry'

export const PIECE_IDS = ['I4', 'L4', 'S4', 'L5', 'N5', 'P5', 'T5', 'U5', 'V5', 'Z5'] as const
export type PieceId = (typeof PIECE_IDS)[number]

export interface PieceDef {
  id: PieceId
  /** Spoken name for screen readers. */
  name: string
  cells: readonly Cell[]
}

function shape(rows: string[]): Cell[] {
  const cells: Cell[] = []
  rows.forEach((line, r) => [...line].forEach((ch, c) => ch === 'X' && cells.push([r, c])))
  return cells
}

/** The ten wooden pieces from the photos, in the orientation they first lie on the table. */
export const PIECES: readonly PieceDef[] = [
  { id: 'I4', name: '一字形', cells: shape(['XXXX']) },
  { id: 'L4', name: '小L形', cells: shape(['X..', 'XXX']) },
  { id: 'S4', name: 'S形', cells: shape(['.XX', 'XX.']) },
  { id: 'L5', name: '大L形', cells: shape(['X...', 'XXXX']) },
  { id: 'N5', name: 'N形', cells: shape(['XX..', '.XXX']) },
  { id: 'P5', name: 'P形', cells: shape(['XX', 'XX', 'X.']) },
  { id: 'T5', name: 'T形', cells: shape(['XXX', '.X.', '.X.']) },
  { id: 'U5', name: 'U形', cells: shape(['X.X', 'XXX']) },
  { id: 'V5', name: 'V形', cells: shape(['X..', 'X..', 'XXX']) },
  { id: 'Z5', name: 'Z形', cells: shape(['XX.', '.X.', '.XX']) },
]

export const PIECE_BY_ID = Object.fromEntries(PIECES.map((p) => [p.id, p])) as Record<PieceId, PieceDef>
