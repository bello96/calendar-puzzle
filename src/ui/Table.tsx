import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chooseLayout } from '../game/layout'
import { PIECE_IDS } from '../game/pieces'
import { dayKey, useGame } from '../state/store'
import { Board } from './Board'
import { NoticeToast } from './NoticeToast'
import { inHand, Piece, pieceKeys } from './Piece'
import { PieceActions } from './PieceActions'
import { warmUpSound } from './sound'
import { StatusPanel } from './StatusPanel'
import { TableContext, useTargetDate, type TableView } from './table-context'

const GUTTER = 12

/** The cutting mat: board on one side, loose pieces on the other, scaled to fit the window. */
export function Table() {
  const ref = useRef<HTMLDivElement>(null)
  /** Where the table is on screen; measured when it resizes and at the start of each press. */
  const rect = useRef<DOMRect | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [touch, setTouch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)
  const setLayout = useGame((s) => s.setLayout)
  const date = useTargetDate()

  useLayoutEffect(() => {
    const el = ref.current!
    const measure = () => {
      rect.current = el.getBoundingClientRect()
      setSize({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A new day to make starts a new timer.
  const day = dayKey(date)
  useEffect(() => {
    useGame.getState().trackTarget(day)
  }, [day])

  const view = useMemo<TableView | null>(() => {
    if (!size) return null
    const { layout, cell } = chooseLayout(size.w - 2 * GUTTER, size.h - 2 * GUTTER)
    const matW = (layout.mat.right - layout.mat.left) * cell
    const matH = (layout.mat.bottom - layout.mat.top) * cell
    const origin = {
      x: layout.mat.left - (size.w - matW) / 2 / cell,
      y: layout.mat.top - (size.h - matH) / 2 / cell,
    }
    return {
      layout,
      cell,
      origin,
      visible: { left: origin.x, top: origin.y, right: origin.x + size.w / cell, bottom: origin.y + size.h / cell },
      toWorld(clientX, clientY) {
        const r = rect.current ?? ref.current!.getBoundingClientRect()
        return { x: origin.x + (clientX - r.left) / cell, y: origin.y + (clientY - r.top) / cell }
      },
    }
  }, [size])

  const layout = view?.layout
  useEffect(() => {
    if (layout) setLayout(layout)
  }, [layout, setLayout])

  // Shortcuts go to the piece in hand, or else the one last touched, unless typing or on a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as Element | null)?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return
      const { activeId, draggingId } = useGame.getState()
      const id = draggingId ?? activeId
      if (id) pieceKeys.get(id)?.(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Handles for automated browser checks; stripped from production builds.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __game: useGame, __table: view })
  }, [view])

  // The mat's grid lines fall on the board's cell lines, heavier every five cells.
  const grid = view && {
    minor: `${(-view.origin.x * view.cell) % view.cell}px ${(-view.origin.y * view.cell) % view.cell}px`,
    major: `${(-view.origin.x * view.cell) % (5 * view.cell)}px ${(-view.origin.y * view.cell) % (5 * view.cell)}px`,
  }

  return (
    <div
      ref={ref}
      className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
      style={
        view && grid
          ? {
              backgroundImage: [
                'linear-gradient(to right, var(--color-mat-line-strong) 1px, transparent 1px)',
                'linear-gradient(to bottom, var(--color-mat-line-strong) 1px, transparent 1px)',
                'linear-gradient(to right, var(--color-mat-line) 1px, transparent 1px)',
                'linear-gradient(to bottom, var(--color-mat-line) 1px, transparent 1px)',
              ].join(','),
              backgroundSize: `${5 * view.cell}px ${5 * view.cell}px, ${5 * view.cell}px ${5 * view.cell}px, ${view.cell}px ${view.cell}px, ${view.cell}px ${view.cell}px`,
              backgroundPosition: `${grid.major}, ${grid.major}, ${grid.minor}, ${grid.minor}`,
            }
          : undefined
      }
      onPointerDownCapture={(e) => {
        rect.current = e.currentTarget.getBoundingClientRect()
        warmUpSound()
        // Show touch controls after a touch; a press on one of them must not hide them.
        if (!(e.target as Element).closest('button')) setTouch(e.pointerType !== 'mouse')
        // A second finger tapping anywhere turns the piece being dragged.
        if (!e.isPrimary && useGame.getState().draggingId && inHand.turn) {
          e.stopPropagation()
          inHand.turn(1)
        }
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) useGame.getState().activate(null)
      }}
    >
      {view && (
        <TableContext.Provider value={view}>
          <Board />
          {PIECE_IDS.map((id) => (
            <Piece key={id} id={id} />
          ))}
          <StatusPanel />
          {touch && <PieceActions />}
          <NoticeToast />
          <ControlsHint touch={touch} />
        </TableContext.Provider>
      )}
    </div>
  )
}

function ControlsHint({ touch }: { touch: boolean }) {
  const items = touch
    ? [
        ['拖动', '摆放'],
        ['轻点', '旋转'],
        ['拖着时另一指轻点', '也能旋转'],
      ]
    : [
        ['拖动', '摆放'],
        ['单击 / 滚轮', '旋转'],
        ['右键', '翻面'],
        ['Q E F', '键盘也行'],
      ]
  return (
    <p className="pointer-events-none absolute bottom-2 left-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-5 text-chalk-dim sm:left-6">
      {items.map(([how, what]) => (
        <span key={how}>
          <span className="text-chalk">{how}</span> {what}
        </span>
      ))}
    </p>
  )
}
