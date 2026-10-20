import type { Cell } from './geometry'

/**
 * The physical board, measured from the photos (cell = 1 unit):
 *
 *   1月  2月  3月  4月  5月  6月
 *   7月  8月  9月 10月 11月 12月
 *   1日  2日  3日  4日  5日  6日  7日
 *   8日  ...                     14日
 *   15日 ...                     21日
 *   22日 ...                     28日
 *   29日 30日 31日 星期日 星期一 星期二 星期三
 *                  星期四 星期五 星期六
 */
export const BOARD_ROWS = 8
export const BOARD_COLS = 7

export function isBoardCell(row: number, col: number): boolean {
  if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) return false
  if (row <= 1) return col <= 5
  if (row === 7) return col >= 4
  return true
}

export const BOARD_CELLS: readonly Cell[] = (() => {
  const cells: Cell[] = []
  for (let r = 0; r < BOARD_ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) if (isBoardCell(r, c)) cells.push([r, c])
  return cells
})()

export type CellKind = 'month' | 'day' | 'weekday'

/** weekday follows Date#getDay(): 0 = 星期日 … 6 = 星期六 */
export interface CellLabel {
  kind: CellKind
  value: number
}

export interface BoardDate {
  month: number
  day: number
  weekday: number
}

export function cellForMonth(month: number): Cell {
  return [Math.floor((month - 1) / 6), (month - 1) % 6]
}

export function cellForDay(day: number): Cell {
  return [2 + Math.floor((day - 1) / 7), (day - 1) % 7]
}

export function cellForWeekday(weekday: number): Cell {
  return weekday <= 3 ? [6, 3 + weekday] : [7, weekday]
}

export function labelAt(row: number, col: number): CellLabel | null {
  if (!isBoardCell(row, col)) return null
  if (row <= 1) return { kind: 'month', value: row * 6 + col + 1 }
  const day = (row - 2) * 7 + col + 1
  if (day <= 31) return { kind: 'day', value: day }
  return { kind: 'weekday', value: row === 6 ? col - 3 : col }
}

export function targetCells(date: Date): Cell[] {
  return [cellForMonth(date.getMonth() + 1), cellForDay(date.getDate()), cellForWeekday(date.getDay())]
}

/** The date spelled out by exactly three open cells, or null if they don't form one. */
export function dateFromCells(cells: readonly Cell[]): BoardDate | null {
  if (cells.length !== 3) return null
  const found: Partial<Record<CellKind, number>> = {}
  for (const [r, c] of cells) {
    const label = labelAt(r, c)
    if (!label || found[label.kind] !== undefined) return null
    found[label.kind] = label.value
  }
  const { month, day, weekday } = found
  if (month === undefined || day === undefined || weekday === undefined) return null
  return { month, day, weekday }
}
