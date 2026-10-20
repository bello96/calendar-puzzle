import {
  animate,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
  type ValueAnimationTransition,
} from 'motion/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { bounds, mod, rotatePoint, type Cell, type Point } from '../game/geometry'
import { outlinePolygon, roundedPath } from '../game/outline'
import { PIECE_BY_ID, type PieceId } from '../game/pieces'
import { aimAt } from '../game/placement'
import { centerOf, isFlipped, shapeOf, takenBy, topLeftOf } from '../game/state'
import { useGame, type TablePiece } from '../state/store'
import { play } from './sound'
import { useTable } from './table-context'

/** Gap left around each piece, like the kerf of the laser cut. */
const KERF = 0.035

/** Ten slightly different cuts of basswood. */
const WOOD: Record<PieceId, string> = {
  I4: '#ead6b0',
  L4: '#e6cfa4',
  S4: '#ecdab8',
  L5: '#e3c99b',
  N5: '#e9d3aa',
  P5: '#eedcbc',
  T5: '#e2c697',
  U5: '#e8d1a7',
  V5: '#e5cca0',
  Z5: '#ebd7b3',
}

const SETTLE: ValueAnimationTransition<number> = { type: 'spring', stiffness: 520, damping: 36 }
const SWING: ValueAnimationTransition<number> = { type: 'spring', stiffness: 380, damping: 25 }
const TURN_OVER: ValueAnimationTransition<number> = { type: 'spring', stiffness: 240, damping: 24 }
const LIFT: ValueAnimationTransition<number> = { type: 'spring', stiffness: 480, damping: 32 }

type Change = 1 | -1 | 'flip'
type Stoppable = { stop(): void }

/**
 * Lets the table turn the piece in hand, e.g. when a second finger taps the
 * table while the first one drags.
 */
export const inHand: { turn: ((change: Change) => void) | null } = { turn: null }

/** Each piece's keyboard handler; the table sends keys to the active piece. */
export const pieceKeys = new Map<PieceId, (e: KeyboardEvent) => void>()

/** The piece being pressed or dragged. One at a time: a second finger never picks up a second piece. */
let pressed: PieceId | null = null

interface Session {
  pointerId: number
  pointerType: string
  /** Where the press started, in screen pixels... */
  start: Point
  /** ...and in cells. */
  grabbed: Point
  /** Latest pointer position, in cells. */
  pointer: Point
  dragging: boolean
  /** Piece centre minus pointer, as currently shown... */
  offset: Point
  /** ...and once any turn in hand has finished. */
  offsetGoal: Point
}

const rotateBy = (v: Point, rad: number): Point => ({
  x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
  y: v.x * Math.sin(rad) + v.y * Math.cos(rad),
})

/** Where the piece should come to rest, as visual values. */
function restingPose(p: TablePiece) {
  const c = centerOf(p)
  return { x: c.x, y: c.y, angle: p.turns * 90 + p.tilt, flip: p.flips * 180 }
}

/**
 * Where the centre of the piece's cell nearest to `point` is drawn, used as
 * the axis for turning and flipping. `scale` is the size the piece is drawn at.
 */
export function pivotAt(p: TablePiece, point: Point, scale = 1): Point {
  const shape = shapeOf(p)
  const tl = topLeftOf(p)
  const { rows, cols } = bounds(shape)
  const center = { x: tl.x + cols / 2, y: tl.y + rows / 2 }
  // Undo the drawing size and the resting tilt (which shows mirrored when the piece is face down).
  const tilt = ((isFlipped(p) ? -p.tilt : p.tilt) * Math.PI) / 180
  const local = rotateBy({ x: (point.x - center.x) / scale, y: (point.y - center.y) / scale }, -tilt)
  let best: Cell = shape[0]
  let bestD = Infinity
  for (const cell of shape) {
    const d = (cell[1] + 0.5 - cols / 2 - local.x) ** 2 + (cell[0] + 0.5 - rows / 2 - local.y) ** 2
    if (d < bestD) {
      bestD = d
      best = cell
    }
  }
  return {
    x: center.x + (best[1] + 0.5 - cols / 2) * scale,
    y: center.y + (best[0] + 0.5 - rows / 2) * scale,
  }
}

/**
 * Shadow under the piece. `e` is its height: 0 sunk into the board, 1 lying
 * on the table (its edge shows), 2 picked up.
 */
function shadowFor(e: number, cell: number): string {
  const resting = Math.min(1, Math.max(0, e))
  const lifted = Math.max(0, e - 1)
  const edge = 0.06 * cell * resting
  const drop = (0.04 + 0.24 * lifted) * cell * resting
  const blur = (0.05 + 0.28 * lifted) * cell * resting + 0.6
  const alpha = 0.34 - 0.08 * lifted
  return `drop-shadow(0 ${edge.toFixed(2)}px 0 #a27d4b) drop-shadow(0 ${drop.toFixed(2)}px ${blur.toFixed(2)}px rgb(8 26 19 / ${alpha.toFixed(3)}))`
}

export const Piece = memo(function Piece({ id }: { id: PieceId }) {
  const view = useTable()
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
  })
  const p = useGame((s) => s.pieces[id])
  const dragging = useGame((s) => s.draggingId === id)
  const attention = useGame((s) => (s.attention?.id === id ? s.attention.seq : 0))
  const reduced = useReducedMotion() ?? false

  const def = PIECE_BY_ID[id]
  const box = useMemo(() => bounds(def.cells), [def])
  const face = useMemo(() => roundedPath(outlinePolygon(def.cells, KERF), 0.07, 0.035), [def])

  /** Drawn smaller while lying in a phone's tray, full size everywhere else. */
  const sizeFor = (piece: TablePiece) =>
    piece.spot.kind === 'loose' && viewRef.current.layout.inTray(centerOf(piece)) ? viewRef.current.layout.trayScale : 1

  const rest = restingPose(p)
  const x = useMotionValue(rest.x)
  const y = useMotionValue(rest.y)
  const angle = useMotionValue(rest.angle)
  const flipDeg = useMotionValue(rest.flip)
  const elev = useMotionValue(p.spot.kind === 'board' ? 0 : 1)
  const size = useMotionValue(sizeFor(p))
  /** Extra degrees for the hint wiggle, kept apart so it never fights a real turn. */
  const wiggle = useMotionValue(0)
  const cell = useMotionValue(view.cell)
  const ox = useMotionValue(view.origin.x)
  const oy = useMotionValue(view.origin.y)

  useLayoutEffect(() => {
    cell.set(view.cell)
    ox.set(view.origin.x)
    oy.set(view.origin.y)
  }, [view.cell, view.origin.x, view.origin.y, cell, ox, oy])

  const outer = useTransform(() => {
    const s = cell.get()
    return `translate3d(${((x.get() - ox.get() - box.cols / 2) * s).toFixed(2)}px, ${((y.get() - oy.get() - box.rows / 2) * s).toFixed(2)}px, 0)`
  })
  const inner = useTransform(
    () =>
      `perspective(${cell.get() * 14}px) rotateY(${flipDeg.get()}deg) rotate(${angle.get() + wiggle.get()}deg) scale(${size.get() * (1 + 0.045 * Math.max(0, elev.get() - 1))})`,
  )
  const filter = useTransform(() => shadowFor(elev.get(), cell.get() * size.get()))

  const session = useRef<Session | null>(null)
  const lastPointerType = useRef('mouse')
  const wheel = useRef({ acc: 0, lastTurn: 0, lastEvent: 0 })
  const moves = useRef<Stoppable[]>([])
  const lift = useRef<AnimationPlaybackControls | null>(null)
  const grow = useRef<AnimationPlaybackControls | null>(null)
  const stopMoves = () => {
    moves.current.forEach((c) => c.stop())
    moves.current = []
  }
  const setElev = (to: number, opts: ValueAnimationTransition<number> = LIFT) => {
    lift.current?.stop()
    lift.current = null
    if (reduced) elev.set(to)
    else lift.current = animate(elev, to, opts)
  }
  const setSize = (to: number, opts: ValueAnimationTransition<number> = SETTLE) => {
    grow.current?.stop()
    grow.current = null
    if (reduced || size.get() === to) size.set(to)
    else grow.current = animate(size, to, opts)
  }

  // Animate to every new resting state, in the manner the change asks for.
  useLayoutEffect(() => {
    if (session.current?.dragging) return
    const goal = restingPose(p)
    const height = p.spot.kind === 'board' ? 0 : 1
    const m = p.motion
    stopMoves()
    if (m.kind === 'jump' || reduced) {
      x.set(goal.x)
      y.set(goal.y)
      angle.set(goal.angle)
      flipDeg.set(goal.flip)
      lift.current?.stop()
      elev.set(height)
      grow.current?.stop()
      size.set(sizeFor(p))
      return
    }
    setSize(sizeFor(p), m.kind === 'travel' ? { ...SETTLE, delay: m.delay } : SETTLE)

    const c0 = { x: x.get(), y: y.get() }
    const a0 = angle.get()
    const f0 = flipDeg.get()
    const blend = (k: number, path: Point) => {
      x.set(path.x)
      y.set(path.y)
      angle.set(a0 + (goal.angle - a0) * k)
      flipDeg.set(f0 + (goal.flip - f0) * k)
    }

    if (m.kind === 'turn') {
      // Swing round the touched cell: the centre travels on an arc, not a chord.
      const mirrored = mod(Math.round(f0 / 180), 2) === 1
      const sweep = (((mirrored ? -1 : 1) * (goal.angle - a0)) * Math.PI) / 180
      const rel = { x: c0.x - m.pivot.x, y: c0.y - m.pivot.y }
      const end = rotateBy(rel, sweep)
      const fix = { x: goal.x - m.pivot.x - end.x, y: goal.y - m.pivot.y - end.y }
      moves.current.push(
        animate(0, 1, {
          ...SWING,
          onUpdate: (k) => {
            const r = rotateBy(rel, sweep * k)
            blend(k, { x: m.pivot.x + r.x + fix.x * k, y: m.pivot.y + r.y + fix.y * k })
          },
        }),
      )
      setElev(height)
    } else if (m.kind === 'flip') {
      moves.current.push(
        animate(0, 1, {
          ...TURN_OVER,
          onUpdate: (k) => blend(k, { x: c0.x + (goal.x - c0.x) * k, y: c0.y + (goal.y - c0.y) * k }),
        }),
      )
      setElev(height)
    } else if (m.kind === 'travel') {
      // Pick it up, carry it over, set it down.
      let interrupted = false
      const carry = animate(0, 1, {
        type: 'spring',
        stiffness: 150,
        damping: 21,
        delay: m.delay,
        onUpdate: (k) => blend(k, { x: c0.x + (goal.x - c0.x) * k, y: c0.y + (goal.y - c0.y) * k }),
      })
      moves.current.push({
        stop: () => {
          interrupted = true
          carry.stop()
        },
      })
      setElev(1.7, { ...LIFT, delay: m.delay })
      carry.then(() => {
        if (interrupted) return
        setElev(height, SETTLE)
        if (height === 0) play('place')
      })
    } else {
      moves.current.push(
        animate(x, goal.x, SETTLE),
        animate(y, goal.y, SETTLE),
        animate(angle, goal.angle, SETTLE),
        animate(flipDeg, goal.flip, SETTLE),
      )
      setElev(height, SETTLE)
    }
    // Runs once per new pose of this piece (not when only its stacking changes);
    // everything else it reads is a ref or a motion value.
  }, [p.turns, p.flips, p.spot, p.tilt, p.motion])

  // A little wiggle when a hint points at this piece.
  useEffect(() => {
    if (!attention || reduced) return
    const run = animate(wiggle, [0, 7, -6, 4, -2, 0], { duration: 0.6, ease: 'easeInOut' })
    return () => run.stop()
  }, [attention])

  /**
   * Move the piece to follow the pointer and show where it would land. Where
   * it lands is judged from where it is heading (any lift or turn finished),
   * so the preview always matches the drop; the lean towards the slot is then
   * added to where it is drawn now.
   */
  const follow = (s: Session) => {
    const state = useGame.getState()
    const shape = shapeOf(state.pieces[id])
    const heading = { x: s.pointer.x + s.offsetGoal.x, y: s.pointer.y + s.offsetGoal.y }
    const { slot, pull } = aimAt(shape, heading, takenBy(state.pieces, id))
    state.setGhost(slot ? shape.map(([r, c]): Cell => [r + slot.row, c + slot.col]) : null)
    const lean = reduced ? { x: 0, y: 0 } : pull
    x.set(s.pointer.x + s.offset.x + lean.x)
    y.set(s.pointer.y + s.offset.y + lean.y)
  }

  const turnInHand = (change: Change) => {
    const s = session.current
    if (!s?.dragging) return
    stopMoves()
    const state = useGame.getState()
    state.reorientInHand(id, change)
    const piece = useGame.getState().pieces[id]
    const from = { ...s.offset }
    const to = change === 'flip' ? { x: -s.offsetGoal.x, y: s.offsetGoal.y } : rotatePoint(s.offsetGoal, { x: 0, y: 0 }, change)
    s.offsetGoal = to
    const sweep = change === 'flip' ? 0 : (change * Math.PI) / 2
    const end = rotateBy(from, sweep)
    const fix = { x: to.x - end.x, y: to.y - end.y }
    const a0 = angle.get()
    const f0 = flipDeg.get()
    const a1 = piece.turns * 90
    const f1 = piece.flips * 180
    play('turn')
    const step = (k: number) => {
      const r = rotateBy(from, sweep * k)
      s.offset = { x: r.x + fix.x * k, y: r.y + fix.y * k }
      angle.set(a0 + (a1 - a0) * k)
      flipDeg.set(f0 + (f1 - f0) * k)
      if (session.current === s) follow(s)
    }
    if (reduced) step(1)
    else moves.current.push(animate(0, 1, { ...(change === 'flip' ? TURN_OVER : SWING), onUpdate: step }))
  }

  const beginDrag = (s: Session) => {
    stopMoves()
    s.dragging = true
    // Hold the piece by the point that was pressed, however far the pointer has moved since.
    // A piece picked up from a phone's tray grows to full size around that point.
    const s0 = size.get()
    s.offset = { x: x.get() - s.grabbed.x, y: y.get() - s.grabbed.y }
    s.offsetGoal = { x: s.offset.x / s0, y: s.offset.y / s0 }
    useGame.getState().pickUp(id)
    const piece = useGame.getState().pieces[id]
    setSize(1, LIFT)
    if (reduced) s.offset = { ...s.offsetGoal }
    else {
      const from = { ...s.offset }
      const to = { ...s.offsetGoal }
      // Straighten up in the hand.
      moves.current.push(
        animate(angle, piece.turns * 90, LIFT),
        animate(flipDeg, piece.flips * 180, LIFT),
        animate(0, 1, {
          ...LIFT,
          onUpdate: (k) => {
            s.offset = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
            if (session.current === s) follow(s)
          },
        }),
      )
    }
    setElev(2)
    inHand.turn = turnInHand
    play('lift')
  }

  /** Let go: drop where the pointer is, or put the piece back as it was if `cancel`. */
  const endDrag = (s: Session, cancel: boolean) => {
    // The handler stored at pick-up belongs to an older render, so clear it outright.
    inHand.turn = null
    if (session.current === s) session.current = null
    if (pressed === id) pressed = null
    const state = useGame.getState()
    if (cancel) {
      state.cancelDrag(id)
      return
    }
    const { rows, cols } = bounds(shapeOf(state.pieces[id]))
    // Never leave a piece out of reach.
    const v = viewRef.current.visible
    const center = {
      x: Math.min(Math.max(s.pointer.x + s.offsetGoal.x, v.left + cols / 2 - 0.4), v.right - cols / 2 + 0.4),
      y: Math.min(Math.max(s.pointer.y + s.offsetGoal.y, v.top + rows / 2 - 0.4), v.bottom - rows / 2 + 0.4),
    }
    if (state.release(id, { x: center.x - cols / 2, y: center.y - rows / 2 })) play('place')
  }

  /** Turn (or flip) where the piece lies, around the cell nearest `point`. */
  const turnHere = (change: Change, point: Point) => {
    const state = useGame.getState()
    const piece = state.pieces[id]
    // Judge the pivot against where the piece is coming to rest, even if it is still on its way there.
    const pivot = pivotAt(piece, point, sizeFor(piece))
    if (change === 'flip') state.flipPiece(id, pivot)
    else state.turnPiece(id, change, pivot)
    play('turn')
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || session.current || (pressed && pressed !== id)) return
    pressed = id
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const at = viewRef.current.toWorld(e.clientX, e.clientY)
    session.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      start: { x: e.clientX, y: e.clientY },
      grabbed: at,
      pointer: at,
      dragging: false,
      offset: { x: 0, y: 0 },
      offsetGoal: { x: 0, y: 0 },
    }
    useGame.getState().activate(id)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = session.current
    if (!s || s.pointerId !== e.pointerId) return
    s.pointer = viewRef.current.toWorld(e.clientX, e.clientY)
    if (!s.dragging) {
      const moved = Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y)
      if (moved < (s.pointerType === 'mouse' ? 4 : 8)) return
      beginDrag(s)
    }
    follow(s)
  }

  const finish = (e: React.PointerEvent, tap: boolean) => {
    const s = session.current
    if (!s || s.pointerId !== e.pointerId) return
    if (s.dragging) return endDrag(s, false)
    session.current = null
    if (pressed === id) pressed = null
    if (tap) turnHere(1, s.pointer)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    // A long press on a touch screen also opens the context menu; that is not a request to flip.
    if (lastPointerType.current === 'touch') return
    if (session.current?.dragging) turnInHand('flip')
    else turnHere('flip', viewRef.current.toWorld(e.clientX, e.clientY))
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) return
    const w = wheel.current
    const now = performance.now()
    if (now - w.lastEvent > 250) w.acc = 0
    w.lastEvent = now
    w.acc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY
    if (Math.abs(w.acc) < 40 || now - w.lastTurn < 150) return
    const dir = w.acc > 0 ? 1 : -1
    w.acc = 0
    w.lastTurn = now
    if (session.current?.dragging) turnInHand(dir)
    else turnHere(dir, viewRef.current.toWorld(e.clientX, e.clientY))
  }

  /** Keyboard shortcuts, routed here by the table while this piece is active or in hand. */
  const onKey = (e: KeyboardEvent) => {
    const s = session.current
    const state = useGame.getState()
    const piece = state.pieces[id]
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const change: Change | 0 = key === 'e' || key === 'r' ? 1 : key === 'q' ? -1 : key === 'f' ? 'flip' : 0
    if (change) {
      e.preventDefault()
      if (s?.dragging) turnInHand(change)
      else turnHere(change, centerOf(piece))
      return
    }
    if (key === 'Escape') {
      e.preventDefault()
      if (s?.dragging) endDrag(s, true)
      else state.sendHome(id)
      return
    }
    if (s?.dragging) return
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (key in arrows) {
      e.preventDefault()
      state.nudgePiece(id, ...arrows[key])
      if (useGame.getState().pieces[id].spot.kind === 'board') play('place')
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault()
      turnHere(1, centerOf(piece))
    } else if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault()
      state.sendHome(id)
    }
  }

  const keyHandler = useRef(onKey)
  useLayoutEffect(() => {
    keyHandler.current = onKey
  })
  useEffect(() => {
    pieceKeys.set(id, (e) => keyHandler.current(e))
    return () => {
      pieceKeys.delete(id)
    }
  }, [id])

  const layer = dragging ? 1000 : (p.spot.kind === 'board' ? 10 : 100) + p.z
  const where = p.spot.kind === 'board' ? `，在拼盘第${p.spot.row + 1}行第${p.spot.col + 1}列` : '，在桌上'

  return (
    <m.div
      className="pointer-events-none absolute top-0 left-0"
      style={{ width: box.cols * view.cell, height: box.rows * view.cell, transform: outer, filter, zIndex: layer, willChange: 'transform' }}
      onPointerDown={(e) => {
        lastPointerType.current = e.pointerType
        onPointerDown(e)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onLostPointerCapture={(e) => finish(e, false)}
      onContextMenu={onContextMenu}
      onWheel={onWheel}
    >
      <m.div
        role="button"
        tabIndex={0}
        aria-label={`${def.name}拼块${where}`}
        onFocus={() => useGame.getState().activate(id)}
        className="h-full w-full rounded-[3px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-chalk"
        style={{ transform: inner, transformOrigin: '50% 50%' }}
      >
        <svg
          viewBox={`0 0 ${box.cols} ${box.rows}`}
          width="100%"
          height="100%"
          overflow="visible"
          className="block"
          style={{ touchAction: 'none' }}
        >
          <path
            d={face}
            fill={WOOD[id]}
            className="pointer-events-auto cursor-grab"
            style={{ cursor: dragging ? 'grabbing' : undefined }}
          />
          <path d={face} fill="#fff" filter={`url(#grain-${id})`} className="pointer-events-none" />
          <path d={face} fill="none" stroke="#5b391b" strokeOpacity={0.55} strokeWidth={0.022} className="pointer-events-none" />
        </svg>
      </m.div>
    </m.div>
  )
})
