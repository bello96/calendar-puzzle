import { describe, expect, it } from 'vitest'
import type { Cell } from './geometry'
import { aimAt, snapToBoard } from './placement'

const L4: Cell[] = [[0, 0], [1, 0], [1, 1], [1, 2]] // X.. / XXX
const I4: Cell[] = [[0, 0], [0, 1], [0, 2], [0, 3]]
const nothing = () => false

describe('snapToBoard', () => {
  it('lands on the slot under the piece', () => {
    expect(snapToBoard(L4, { x: 2, y: 3 }, nothing)).toEqual({ row: 3, col: 2 })
  })

  it('rounds to the nearest slot', () => {
    expect(snapToBoard(L4, { x: 2.3, y: 2.6 }, nothing)).toEqual({ row: 3, col: 2 })
  })

  it('refuses a slot that hangs off the board', () => {
    // Row 0 has only six cells, so the bar's last cell would sit in the notch.
    expect(snapToBoard(I4, { x: 3, y: 0 }, nothing)).toBeNull()
  })

  it('refuses a slot that overlaps another piece', () => {
    const taken = (r: number, c: number) => r === 3 && c === 2
    expect(snapToBoard(L4, { x: 2, y: 3 }, taken)).toBeNull()
  })

  it('slides to the neighbouring slot when the nearest one is taken', () => {
    const taken = (r: number, c: number) => r === 3 && c === 2
    expect(snapToBoard(L4, { x: 2.45, y: 3 }, taken)).toEqual({ row: 3, col: 3 })
  })

  it('does not slide a whole cell away', () => {
    const taken = (r: number, c: number) => r === 3 && c === 2
    expect(snapToBoard(L4, { x: 2.1, y: 3 }, taken)).toBeNull()
  })
})

describe('aimAt', () => {
  // L4's box is 3 × 2, so a centre of (3.5, 4) puts its top-left exactly on (2, 3).
  it('finds the slot under a piece held exactly over it, with nothing to pull', () => {
    expect(aimAt(L4, { x: 3.5, y: 4 }, nothing)).toEqual({ slot: { row: 3, col: 2 }, pull: { x: 0, y: 0 } })
  })

  it('pulls a nearby piece part of the way towards its slot', () => {
    const { slot, pull } = aimAt(L4, { x: 3.5 + 0.16, y: 4 }, nothing)
    expect(slot).toEqual({ row: 3, col: 2 })
    expect(pull.x).toBeCloseTo(-0.16 * (1 - 0.16 / 0.32), 9)
    expect(pull.y).toBe(0)
  })

  it('shows the slot but does not pull once past the magnet', () => {
    expect(aimAt(L4, { x: 3.5 + 0.4, y: 4 }, nothing)).toEqual({ slot: { row: 3, col: 2 }, pull: { x: 0, y: 0 } })
  })

  it('has no slot off the board', () => {
    expect(aimAt(L4, { x: 15, y: 4 }, nothing)).toEqual({ slot: null, pull: { x: 0, y: 0 } })
  })
})
