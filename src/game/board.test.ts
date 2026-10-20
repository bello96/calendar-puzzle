import { describe, expect, it } from 'vitest'
import { BOARD_CELLS, dateFromCells, isBoardCell, labelAt, targetCells } from './board'

describe('board shape', () => {
  it('has the 50 cells of the physical board', () => {
    expect(BOARD_CELLS).toHaveLength(50)
  })

  it.each([
    [0, 6, false], // notch beside 6月
    [1, 6, false], // notch beside 12月
    [7, 0, false], // "每天都要拼一拼" area
    [7, 3, false],
    [7, 4, true], // 星期四
    [6, 6, true], // 星期三
    [1, 5, true], // 12月
    [8, 4, false],
    [-1, 0, false],
  ])('cell (%i, %i) is on the board: %s', (row, col, expected) => {
    expect(isBoardCell(row, col)).toBe(expected)
  })
})

describe('targetCells', () => {
  // The three photographed solutions: 10月19日 星期一, 10月16日 星期五, 10月18日 星期日
  it.each([
    [new Date(2026, 9, 19), [[1, 3], [4, 4], [6, 4]]],
    [new Date(2026, 9, 16), [[1, 3], [4, 1], [7, 5]]],
    [new Date(2026, 9, 18), [[1, 3], [4, 3], [6, 3]]],
    [new Date(2026, 0, 1), [[0, 0], [2, 0], [7, 4]]], // 1月1日 星期四
    [new Date(2026, 11, 31), [[1, 5], [6, 2], [7, 4]]], // 12月31日 星期四
    [new Date(2026, 4, 30), [[0, 4], [6, 1], [7, 6]]], // 5月30日 星期六
    [new Date(2026, 6, 15), [[1, 0], [4, 0], [6, 6]]], // 7月15日 星期三
  ])('leaves the right cells open for %s', (date, cells) => {
    expect(targetCells(date)).toEqual(cells)
  })
})

describe('labelAt', () => {
  it.each([
    [1, 3, { kind: 'month', value: 10 }],
    [4, 4, { kind: 'day', value: 19 }],
    [6, 2, { kind: 'day', value: 31 }],
    [6, 3, { kind: 'weekday', value: 0 }],
    [7, 6, { kind: 'weekday', value: 6 }],
  ])('reads the engraving at (%i, %i)', (row, col, label) => {
    expect(labelAt(row, col)).toEqual(label)
  })

  it('has no engraving off the board', () => {
    expect(labelAt(1, 6)).toBeNull()
  })
})

describe('dateFromCells', () => {
  it('reads a month, day and weekday in any order', () => {
    expect(dateFromCells([[6, 4], [1, 3], [4, 4]])).toEqual({ month: 10, day: 19, weekday: 1 })
  })

  it('rejects two cells of the same kind', () => {
    expect(dateFromCells([[0, 0], [0, 1], [6, 4]])).toBeNull()
  })

  it('rejects anything other than three cells', () => {
    expect(dateFromCells([[1, 3], [4, 4]])).toBeNull()
  })
})
