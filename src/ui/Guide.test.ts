import { describe, expect, it } from 'vitest'
import { isBoardCell, targetCells } from '../game/board'
import { landingFor } from './Guide'

describe('where the guide drops its piece', () => {
  it('is in the board and leaves the three cells of the day showing, whatever the day', () => {
    // 28 years on end hold every month, day and weekday that can fall together.
    const date = new Date(2000, 0, 1)
    const end = new Date(2028, 0, 1)
    let days = 0
    for (; date < end; date.setDate(date.getDate() + 1), days++) {
      const open = targetCells(date).map(([r, c]) => `${r},${c}`)
      const { cells } = landingFor(targetCells(date))
      const where = date.toDateString()
      expect(cells, where).toHaveLength(4)
      for (const [r, c] of cells) {
        expect(isBoardCell(r, c), where).toBe(true)
        expect(open, where).not.toContain(`${r},${c}`)
      }
    }
    expect(days).toBe(10227)
  })

  it('reports the top-left of the box those cells fill', () => {
    const { slot, cells } = landingFor(targetCells(new Date(2026, 10, 25)))
    expect(Math.min(...cells.map(([r]) => r))).toBe(slot[0])
    expect(Math.min(...cells.map(([, c]) => c))).toBe(slot[1])
  })
})
