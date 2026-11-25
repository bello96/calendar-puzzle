import { createContext, useContext, useMemo } from 'react'
import type { Point } from '../game/geometry'
import type { TableLayout } from '../game/layout'
import type { Rect } from '../game/placement'
import { targetDate, useGame } from '../state/store'

/** How the table maps cells (world units) to pixels inside its container. */
export interface TableView {
  layout: TableLayout
  /** Pixels per cell. */
  cell: number
  /** World position of the container's top-left corner. */
  origin: Point
  /** The world area the container shows. */
  visible: Rect
  /** How many px at the top of the container lie under the top bar. */
  bar: number
  toWorld(clientX: number, clientY: number): Point
}

export const TableContext = createContext<TableView | null>(null)

export function useTable(): TableView {
  const view = useContext(TableContext)
  if (!view) throw new Error('useTable must be used inside the table')
  return view
}

/**
 * The date to spell out. "Today" is the day the page was opened on: with the page left open
 * past midnight it stays that day, until the page is loaded again.
 */
export function useTargetDate(): Date {
  const target = useGame((s) => s.target)
  return useMemo(() => targetDate(target), [target])
}

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDate(d: { month: number; day: number; weekday: number }): string {
  return `${d.month}月${d.day}日 星期${WEEKDAYS[d.weekday]}`
}

export const dateParts = (date: Date) => ({ month: date.getMonth() + 1, day: date.getDate(), weekday: date.getDay() })
