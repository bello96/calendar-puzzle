import { describe, expect, it } from 'vitest'
import { tableLayout } from './layout'
import { PIECE_IDS, type PieceId } from './pieces'
import { overlapping, type Drawn } from './stacking'
import { centerOf } from './state'

const loose = (id: PieceId, x: number, y: number, more: Partial<Drawn> = {}): Drawn => ({
  id,
  turns: 0,
  flips: 0,
  spot: { kind: 'loose', x, y },
  tilt: 0,
  scale: 1,
  ...more,
})

const fitted = (id: PieceId, row: number, col: number): Drawn => ({
  id,
  turns: 0,
  flips: 0,
  spot: { kind: 'board', row, col },
  tilt: 0,
  scale: 1,
})

describe('overlapping', () => {
  it('finds a piece lying on another', () => {
    expect(overlapping(loose('T5', 10, 2), loose('L4', 10.5, 2.5))).toBe(true)
  })

  it('does not count pieces side by side in the board', () => {
    // The bar along row 0, the small L (X.. / XXX) right under it.
    expect(overlapping(fitted('I4', 0, 0), fitted('L4', 1, 0))).toBe(false)
  })

  it('does not count a hairline overlap, but does count a real one', () => {
    expect(overlapping(loose('I4', 10, 2), loose('I4', 10, 2.95))).toBe(false)
    expect(overlapping(loose('I4', 10, 2), loose('I4', 10, 2.5))).toBe(true)
  })

  it('looks at the cells, not the box around them', () => {
    // The bar lies in the crook of the V (X.. / X.. / XXX): inside its box, on none of its cells.
    expect(overlapping(loose('V5', 10, 1), loose('I4', 11.1, 2))).toBe(false)
  })

  it('turns each piece by the angle it rests at', () => {
    // A second bar just below the first, its left half under the first one's right half.
    const top = loose('I4', 10, 2)
    expect(overlapping(top, loose('I4', 12, 3.05))).toBe(false)
    // Turned clockwise, its left end rises into the first bar; turned the other way, it drops away.
    expect(overlapping(top, loose('I4', 12, 3.05, { tilt: 12 }))).toBe(true)
    expect(overlapping(top, loose('I4', 12, 3.05, { tilt: -12 }))).toBe(false)
  })

  it('shows the resting angle mirrored while a piece is face down', () => {
    const top = loose('I4', 10, 2)
    expect(overlapping(top, loose('I4', 12, 3.05, { flips: 1, tilt: 12 }))).toBe(false)
    expect(overlapping(top, loose('I4', 12, 3.05, { flips: 1, tilt: -12 }))).toBe(true)
  })

  it('draws a piece in a phone tray at its smaller size', () => {
    expect(overlapping(loose('I4', 10, 2), loose('I4', 10, 2.7))).toBe(true)
    expect(overlapping(loose('I4', 10, 2, { scale: 0.5 }), loose('I4', 10, 2.7, { scale: 0.5 }))).toBe(false)
  })
})

describe('pieces set out in the tray', () => {
  const layouts = [
    tableLayout('wide'),
    ...[0.45, 0.54, 0.6, 0.7, 0.8].flatMap((s) => [tableLayout('tall', 'rows2', s), tableLayout('tall', 'rows3', s)]),
  ]

  it.each(layouts.map((l) => [`${l.key} at ${l.trayScale}`, l] as const))('%s: none lies on another', (_, layout) => {
    // A first click on any of them turns it straight away.
    const drawn = PIECE_IDS.map((id): Drawn => {
      const home = layout.homes[id]
      const p = { id, turns: home.turns, flips: 0, spot: { kind: 'loose' as const, x: home.x, y: home.y } }
      return { ...p, tilt: layout.tilts[id], scale: layout.inTray(centerOf(p)) ? layout.trayScale : 1 }
    })
    for (const a of drawn) {
      for (const b of drawn) {
        if (a.id < b.id) expect(overlapping(a, b), `${a.id} and ${b.id}`).toBe(false)
      }
    }
  })
})
