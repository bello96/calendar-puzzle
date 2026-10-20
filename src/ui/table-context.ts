import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
  toWorld(clientX: number, clientY: number): Point
}

export const TableContext = createContext<TableView | null>(null)

export function useTable(): TableView {
  const view = useContext(TableContext)
  if (!view) throw new Error('useTable must be used inside the table')
  return view
}

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** The date to spell out; follows the clock past midnight when it is "today". */
export function useTargetDate(): Date {
  const target = useGame((s) => s.target)
  const [today, setToday] = useState(startOfToday)
  useEffect(() => {
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const timer = setTimeout(() => setToday(startOfToday()), midnight.getTime() - Date.now() + 500)
    return () => clearTimeout(timer)
  }, [today])
  return useMemo(() => targetDate(target, today), [target, today])
}

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDate(d: { month: number; day: number; weekday: number }): string {
  return `${d.month}月${d.day}日 星期${WEEKDAYS[d.weekday]}`
}

export const dateParts = (date: Date) => ({ month: date.getMonth() + 1, day: date.getDate(), weekday: date.getDay() })
