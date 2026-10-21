import { describe, expect, it } from 'vitest'
import { bounds } from './geometry'
import { chooseLayout, deal, FRAME, tableLayout, type Home, type TableLayout } from './layout'
import { PIECE_IDS, type PieceId } from './pieces'
import { shapeOf } from './state'
import { seeded } from './testing/random'

/** The box a dealt piece occupies, as drawn (scaled around its centre). */
function homeBox(layout: TableLayout, home: Home, id: PieceId) {
  const { rows, cols } = bounds(shapeOf({ id, turns: home.turns, flips: 0 }))
  const cx = home.x + cols / 2
  const cy = home.y + rows / 2
  const s = layout.trayScale
  return { left: cx - (cols * s) / 2, right: cx + (cols * s) / 2, top: cy - (rows * s) / 2, bottom: cy + (rows * s) / 2 }
}

describe.each(['wide', 'tall'] as const)('%s table', (mode) => {
  const layout = tableLayout(mode)
  const deals = Array.from({ length: 8 }, (_, i) => deal(layout, seeded(i + 1)))

  it('deals every piece into the tray, which is clear of the board', () => {
    for (const homes of deals) {
      for (const id of PIECE_IDS) {
        const box = homeBox(layout, homes[id], id)
        expect(box.left).toBeGreaterThanOrEqual(layout.tray.left - 1e-9)
        expect(box.top).toBeGreaterThanOrEqual(layout.tray.top - 1e-9)
        expect(box.right).toBeLessThanOrEqual(layout.tray.right + 1e-9)
        expect(box.bottom).toBeLessThanOrEqual(layout.tray.bottom + 1e-9)
      }
    }
    expect(layout.tray.left >= FRAME.right || layout.tray.top >= FRAME.bottom).toBe(true)
  })

  it('shrinks exactly the pieces lying in the tray', () => {
    for (const homes of deals) {
      for (const id of PIECE_IDS) {
        const box = homeBox(layout, homes[id], id)
        expect(layout.inTray({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 })).toBe(true)
      }
    }
    expect(layout.inTray({ x: 3.5, y: 4 })).toBe(false) // middle of the board
  })

  it('deals the pieces somewhere new each time', () => {
    const spots = deals.map((homes) => PIECE_IDS.map((id) => `${homes[id].x.toFixed(2)},${homes[id].y.toFixed(2)}`).join(' '))
    expect(new Set(spots).size).toBe(deals.length)
  })

  it('keeps the board and the tray inside the table', () => {
    const { mat, tray } = layout
    expect(mat.left).toBeLessThan(Math.min(FRAME.left, tray.left))
    expect(mat.top).toBeLessThan(Math.min(FRAME.top, tray.top))
    expect(mat.right).toBeGreaterThan(Math.max(FRAME.right, tray.right))
    expect(mat.bottom).toBeGreaterThan(Math.max(FRAME.bottom, tray.bottom))
  })
})

describe('chooseLayout', () => {
  it('puts the pieces beside the board on a landscape screen', () => {
    expect(chooseLayout(1416, 820).layout.mode).toBe('wide')
  })

  it('puts the pieces below the board on a phone held upright', () => {
    expect(chooseLayout(366, 680).layout.mode).toBe('tall')
  })

  it('keeps cells big enough to handle on a phone', () => {
    expect(chooseLayout(366, 680).cell).toBeGreaterThanOrEqual(34)
  })

  it('uses a tall phone screen to draw the tray bigger', () => {
    expect(chooseLayout(366, 720).layout.trayScale).toBeGreaterThan(0.65)
  })

  it('still fits everything on a short phone screen', () => {
    const { layout, cell } = chooseLayout(336, 520)
    expect(layout.mode).toBe('tall')
    expect((layout.mat.bottom - layout.mat.top) * cell).toBeLessThanOrEqual(520)
    expect((layout.mat.right - layout.mat.left) * cell).toBeLessThanOrEqual(336)
  })

  it('sizes cells so the whole table fits', () => {
    const { layout, cell } = chooseLayout(1416, 820)
    expect((layout.mat.right - layout.mat.left) * cell).toBeLessThanOrEqual(1416)
    expect((layout.mat.bottom - layout.mat.top) * cell).toBeLessThanOrEqual(820)
    expect(cell).toBeGreaterThanOrEqual(60)
  })
})
