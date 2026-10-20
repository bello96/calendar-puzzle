import { describe, expect, it } from 'vitest'
import { BOARD_CELLS, cellForDay, cellForMonth, cellForWeekday, targetCells } from './board'
import type { Cell } from './geometry'
import { canonical } from './testing/shapes'
import { PIECE_BY_ID, PIECE_IDS } from './pieces'
import { solve, type Placement } from './solver'
import { PHOTO_SOLUTIONS } from './testing/photos'

const k = ([r, c]: Cell) => `${r},${c}`

/** Independent check: every piece used once in its own shape, and the board covered except `open`. */
function expectExactCover(solution: Placement[] | null, open: Cell[]) {
  expect(solution).not.toBeNull()
  const placements = solution!
  expect(placements.map((p) => p.id).sort()).toEqual([...PIECE_IDS].sort())
  for (const p of placements) expect(canonical(p.cells)).toBe(canonical(PIECE_BY_ID[p.id].cells))
  const covered = placements.flatMap((p) => p.cells.map(k))
  expect(new Set(covered).size).toBe(covered.length)
  expect([...covered, ...open.map(k)].sort()).toEqual(BOARD_CELLS.map(k).sort())
}

describe('solve', () => {
  it.each(PHOTO_SOLUTIONS.map((s) => [s.date]))('solves the photographed date %s', (date) => {
    const open = targetCells(date)
    expectExactCover(solve(open), open)
  })

  it('keeps pieces that are already placed where they are', () => {
    const { date, pieces } = PHOTO_SOLUTIONS[0]
    const fixed: Placement[] = [{ id: 'I4', cells: pieces.I4 }, { id: 'P5', cells: pieces.P5 }]
    const solution = solve(targetCells(date), fixed)
    expectExactCover(solution, targetCells(date))
    expect(solution!.find((p) => p.id === 'I4')!.cells).toEqual(pieces.I4)
    expect(solution!.find((p) => p.id === 'P5')!.cells).toEqual(pieces.P5)
  })

  it('gives up when a placed piece walls off a single cell', () => {
    // 7月15日 星期三: 7月 is (1,0); an upright bar in column 1 strands 1月 at (0,0).
    const fixed: Placement[] = [{ id: 'I4', cells: [[0, 1], [1, 1], [2, 1], [3, 1]] }]
    expect(solve(targetCells(new Date(2026, 6, 15)), fixed)).toBeNull()
  })

  it('gives up when a placed piece covers a date cell', () => {
    const fixed: Placement[] = [{ id: 'I4', cells: [[1, 0], [1, 1], [1, 2], [1, 3]] }]
    expect(solve(targetCells(new Date(2026, 6, 15)), fixed)).toBeNull()
  })

  it('gives up when two placed pieces overlap', () => {
    const fixed: Placement[] = [
      { id: 'I4', cells: [[6, 0], [6, 1], [6, 2], [6, 3]] },
      { id: 'L4', cells: [[5, 0], [6, 0], [6, 1], [6, 2]] },
    ]
    expect(solve(targetCells(new Date(2026, 9, 20)), fixed)).toBeNull()
  })

  it('solves every month / day / weekday combination', () => {
    const unsolved: string[] = []
    const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= daysIn[month - 1]; day++) {
        for (let weekday = 0; weekday < 7; weekday++) {
          const open = [cellForMonth(month), cellForDay(day), cellForWeekday(weekday)]
          const solution = solve(open)
          if (!solution) unsolved.push(`${month}/${day}/${weekday}`)
          else if (month === 2 && day === 29 && weekday === 3) expectExactCover(solution, open) // spot-check one
        }
      }
    }
    expect(unsolved).toEqual([])
  }, 120_000)
})
