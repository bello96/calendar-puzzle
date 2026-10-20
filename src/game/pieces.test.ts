import { describe, expect, it } from 'vitest'
import { BOARD_CELLS, targetCells } from './board'
import { canonical } from './testing/shapes'
import { PIECES, PIECE_IDS } from './pieces'
import { PHOTO_SOLUTIONS } from './testing/photos'

describe('piece set', () => {
  it('is seven pentominoes and three tetrominoes, 47 cells in all', () => {
    const sizes = PIECES.map((p) => p.cells.length).sort()
    expect(sizes).toEqual([4, 4, 4, 5, 5, 5, 5, 5, 5, 5])
  })

  it('has no two pieces of the same shape', () => {
    const shapes = new Set(PIECES.map((p) => canonical(p.cells)))
    expect(shapes.size).toBe(10)
  })

  describe.each(PHOTO_SOLUTIONS)('matches the photo of $date', ({ date, pieces }) => {
    it.each(PIECE_IDS)('%s has the shape traced from the photo', (id) => {
      const def = PIECES.find((p) => p.id === id)!
      expect(canonical(pieces[id])).toBe(canonical(def.cells))
    })

    it('covers every board cell except the date exactly once', () => {
      const covered = Object.values(pieces).flat().map(([r, c]) => `${r},${c}`)
      const open = targetCells(date).map(([r, c]) => `${r},${c}`)
      expect(new Set(covered).size).toBe(covered.length)
      expect([...covered, ...open].sort()).toEqual(BOARD_CELLS.map(([r, c]) => `${r},${c}`).sort())
    })
  })
})
