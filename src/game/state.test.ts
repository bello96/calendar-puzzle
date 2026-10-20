import { describe, expect, it } from 'vitest'
import { targetCells } from './board'
import type { Cell } from './geometry'
import { PIECE_IDS, type PieceId } from './pieces'
import { solve } from './solver'
import {
  answerFor,
  cellsOnBoard,
  dropAt,
  flip,
  hint,
  nudge,
  orientationFor,
  shapeOf,
  status,
  turn,
  type PieceMap,
  type PieceState,
} from './state'
import { PHOTO_SOLUTIONS } from './testing/photos'

/** All pieces lying loose off to the side, with some overridden. */
function table(overrides: Partial<Record<PieceId, Partial<PieceState>>> = {}): PieceMap {
  const pieces = {} as PieceMap
  PIECE_IDS.forEach((id, i) => {
    pieces[id] = { id, turns: 0, flips: 0, spot: { kind: 'loose', x: 20, y: i * 3 }, ...overrides[id] }
  })
  return pieces
}

const onBoard = (row: number, col: number) => ({ kind: 'board' as const, row, col })
const I4_ROW6 = { I4: { spot: onBoard(6, 0) } } // covers (6,0)–(6,3)

/** The photo-2 solution as piece states. */
function photoTable(index: number): PieceMap {
  const pieces = table()
  for (const id of PIECE_IDS) {
    const o = orientationFor(id, PHOTO_SOLUTIONS[index].pieces[id], { turns: 0, flips: 0 })
    pieces[id] = { id, turns: o.turns, flips: o.flips, spot: onBoard(o.row, o.col) }
  }
  return pieces
}

describe('dropAt', () => {
  it('places the piece in the free slot under it', () => {
    expect(dropAt(table(), 'L4', { x: 2.2, y: 3.1 }).L4.spot).toEqual(onBoard(3, 2))
  })

  it('leaves the piece resting on top when the slot is taken', () => {
    expect(dropAt(table(I4_ROW6), 'L4', { x: 0, y: 5 }).L4.spot).toEqual({ kind: 'loose', x: 0, y: 5 })
  })

  it('leaves the piece where it was dropped off the board', () => {
    expect(dropAt(table(), 'L4', { x: 12.3, y: 4.4 }).L4.spot).toEqual({ kind: 'loose', x: 12.3, y: 4.4 })
  })
})

describe('turn', () => {
  const placed = table({ L4: { spot: onBoard(3, 2) } }) // cells (3,2) (4,2) (4,3) (4,4)
  const corner = { x: 2.5, y: 4.5 } // centre of cell (4,2)

  it('keeps the touched cell in place and stays on the board', () => {
    const after = turn(placed, 'L4', 1, corner).L4
    expect(after.turns).toBe(1)
    expect(after.spot).toEqual(onBoard(4, 2)) // cells (4,2) (4,3) (5,2) (6,2)
  })

  it('lifts the piece out when the turned shape fits nowhere nearby', () => {
    // On a full board, the bar along row 6 turned upright around (6,0) can only hang off the bottom.
    const full = photoTable(0)
    const after = turn(full, 'I4', 1, { x: 0.5, y: 6.5 }).I4
    expect(after.spot.kind).toBe('loose')
    expect(after.turns).toBe(full.I4.turns + 1)
  })

  it('slides a placed piece back into the board when the turn would push it off the edge', () => {
    // Upright bar in column 0, rows 2–5, turned around (3,0): it would stick out to the left.
    const upright = table({ I4: { turns: 1, spot: onBoard(2, 0) } })
    const after = turn(upright, 'I4', 1, { x: 0.5, y: 3.5 }).I4
    expect(after.spot).toEqual(onBoard(3, 0)) // row 3, columns 0–3: still covers the touched cell
  })

  it('does not slide a piece that was lying loose', () => {
    const loose = table({ I4: { turns: 1, spot: { kind: 'loose', x: 0, y: 2 } } })
    expect(turn(loose, 'I4', 1, { x: 0.5, y: 3.5 }).I4.spot).toEqual({ kind: 'loose', x: -2, y: 3 })
  })

  it('turns a flipped piece clockwise as seen on screen', () => {
    const flipped = table({ L4: { flips: 1 } }) // ..X / XXX
    expect(shapeOf(turn(flipped, 'L4', 1, { x: 21, y: 4 }).L4)).toEqual([
      [0, 0], [1, 0], [2, 0], [2, 1],
    ] satisfies Cell[]) // X. / X. / XX
  })
})

describe('flip', () => {
  it('mirrors around the touched column', () => {
    const placed = table({ L4: { spot: onBoard(3, 2) } })
    const after = flip(placed, 'L4', { x: 2.5, y: 4.5 }).L4
    expect(after.flips).toBe(1)
    expect(after.spot).toEqual(onBoard(3, 0)) // ..X / XXX → cells (3,2) (4,0) (4,1) (4,2)
  })
})

describe('nudge', () => {
  it('moves a placed piece one cell when the new slot is free', () => {
    const placed = table({ L4: { spot: onBoard(3, 2) } })
    expect(nudge(placed, 'L4', 1, 0).L4.spot).toEqual(onBoard(3, 3))
  })

  it('lines a loose piece up with the grid so it can reach the board', () => {
    const loose = table({ L4: { spot: { kind: 'loose', x: 2.4, y: 3.3 } } })
    expect(nudge(loose, 'L4', 1, 0).L4.spot).toEqual(onBoard(3, 3))
  })

  it('lets the piece rest on top when the new slot is taken', () => {
    const placed = table({ L4: { spot: onBoard(4, 0) }, ...I4_ROW6 })
    expect(nudge(placed, 'L4', 0, 1).L4.spot).toEqual({ kind: 'loose', x: 0, y: 5 })
  })
})

describe('status', () => {
  it('is solved when every piece is in and the target date is open', () => {
    const s = status(photoTable(0), new Date(2026, 9, 19))
    expect(s).toMatchObject({ placed: 10, complete: true, solved: true })
  })

  it('reports which date is showing when it is not the target', () => {
    const s = status(photoTable(0), new Date(2026, 9, 20))
    expect(s).toMatchObject({ complete: true, solved: false, shown: { month: 10, day: 19, weekday: 1 } })
  })

  it('counts only pieces sitting in the board', () => {
    expect(status(table(I4_ROW6), new Date(2026, 9, 19))).toMatchObject({ placed: 1, complete: false })
  })
})

describe('orientationFor', () => {
  it('prefers the orientation needing the least turning', () => {
    // XX / X. / X. is one clockwise turn of the L. From turns = 4, turning on to 5 beats unwinding to 1.
    const o = orientationFor('L4', [[2, 3], [2, 4], [3, 3], [4, 3]], { turns: 4, flips: 0 })
    expect(o).toEqual({ turns: 5, flips: 0, row: 2, col: 3 })
  })
})

describe('hint', () => {
  const date = new Date(2026, 9, 19)

  it('suggests a piece that still leaves the puzzle solvable', () => {
    const h = hint(table(), date)
    expect(h.kind).toBe('place')
    if (h.kind !== 'place') return
    const placed = table({ [h.id]: { turns: h.turns, flips: h.flips, spot: onBoard(h.row, h.col) } })
    const cells = shapeOf(placed[h.id]).map(([r, c]): Cell => [r + h.row, c + h.col])
    expect(solve(targetCells(date), [{ id: h.id, cells }])).not.toBeNull()
  })

  it('points out pieces covering the date', () => {
    // I4 across row 1 covers 10月.
    expect(hint(table({ I4: { spot: onBoard(1, 0) } }), date)).toEqual({ kind: 'covering', ids: ['I4'] })
  })

  it('points out the piece that makes the board unsolvable', () => {
    // An upright bar in column 1 strands 1月 next to the open 7月.
    const walled = table({ I4: { turns: 1, spot: onBoard(0, 1) } })
    expect(hint(walled, new Date(2026, 6, 15))).toEqual({ kind: 'blocking', id: 'I4' })
  })

  it('says so when the puzzle is already solved', () => {
    expect(hint(photoTable(0), date)).toEqual({ kind: 'done' })
  })
})

describe('answerFor', () => {
  const date = new Date(2026, 9, 19)
  const pieceAt = (pieces: PieceMap, answer: NonNullable<ReturnType<typeof answerFor>>, id: PieceId) =>
    cellsOnBoard({ ...pieces[id], ...answer[id], spot: onBoard(answer[id].row, answer[id].col) })!

  it('solves the whole board, keeping pieces that can stay', () => {
    const pieces = table(I4_ROW6)
    const answer = answerFor(pieces, date)!
    const cells = PIECE_IDS.flatMap((id) => pieceAt(pieces, answer, id))
    expect(new Set(cells.map(String)).size).toBe(47)
    expect(pieceAt(pieces, answer, 'I4')).toEqual([[6, 0], [6, 1], [6, 2], [6, 3]])
  })

  it('starts over when the pieces already placed cannot be completed', () => {
    const walled = table({ I4: { turns: 1, spot: onBoard(0, 1) } })
    const answer = answerFor(walled, new Date(2026, 6, 15))!
    expect(pieceAt(walled, answer, 'I4')).not.toEqual([[0, 1], [1, 1], [2, 1], [3, 1]])
  })
})
