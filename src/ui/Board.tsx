import { memo, useMemo } from 'react'
import { BOARD_CELLS, labelAt, targetCells } from '../game/board'
import type { Cell, Point } from '../game/geometry'
import { FRAME } from '../game/layout'
import { outlinePolygon, roundedPath } from '../game/outline'
import { status } from '../game/state'
import { useGame } from '../state/store'
import { WEEKDAYS, dateParts, formatDate, useTable, useTargetDate } from './table-context'

const FRAME_PATH = roundedPath(
  [
    { x: FRAME.left, y: FRAME.top },
    { x: FRAME.notchX, y: FRAME.top },
    { x: FRAME.notchX, y: FRAME.notchY },
    { x: FRAME.right, y: FRAME.notchY },
    { x: FRAME.right, y: FRAME.bottom },
    { x: FRAME.left, y: FRAME.bottom },
  ],
  FRAME.radius,
)
const CAVITY_PATH = roundedPath(outlinePolygon(BOARD_CELLS), 0.03)

/** Engraved lines between neighbouring cells on the floor of the board. */
const FLOOR_LINES = (() => {
  const has = new Set(BOARD_CELLS.map(([r, c]) => `${r},${c}`))
  let d = ''
  for (const [r, c] of BOARD_CELLS) {
    if (has.has(`${r},${c + 1}`)) d += `M${c + 1} ${r}V${r + 1}`
    if (has.has(`${r + 1},${c}`)) d += `M${c} ${r + 1}H${c + 1}`
  }
  return d
})()

const MARGIN = 0.7
const VIEW = {
  x: FRAME.left - MARGIN,
  y: FRAME.top - MARGIN,
  w: FRAME.right - FRAME.left + 2 * MARGIN,
  h: FRAME.bottom - FRAME.top + 2 * MARGIN,
}

export function Board() {
  const { cell, origin } = useTable()
  const date = useTargetDate()
  const solved = useGame((s) => status(s.pieces, date).solved)
  const ghost = useGame((s) => s.ghost)
  const open = useMemo(() => targetCells(date), [date])

  return (
    <svg
      className="pointer-events-none absolute select-none"
      style={{
        left: (VIEW.x - origin.x) * cell,
        top: (VIEW.y - origin.y) * cell,
        width: VIEW.w * cell,
        height: VIEW.h * cell,
        fontFamily: 'var(--font-sans)',
      }}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`日历拼盘，要露出 ${formatDate(dateParts(date))}`}
    >
      <BoardBody />
      <g key={`${date.toDateString()}-${solved}`}>
        {open.map(([r, c], i) => (
          <PenLoop key={i} cx={c + 0.5} cy={r + 0.5} seed={r * 7 + c} delay={i * 0.12} twice={solved} />
        ))}
      </g>
      {ghost && <Ghost cells={ghost} />}
      <FrameTop />
    </svg>
  )
}

/** Everything that never changes: shadow, edge, floor and its engraving. */
const BoardBody = memo(function BoardBody() {
  return (
    <>
      <path d={FRAME_PATH} transform="translate(0.04 0.2)" fill="rgb(8 22 17 / 0.5)" filter="url(#board-shadow)" />
      <path d={FRAME_PATH} transform="translate(0 0.08)" fill="var(--color-wood-side)" />
      <path d={CAVITY_PATH} fill="var(--color-wood-floor)" />
      <path d={CAVITY_PATH} fill="#fff" filter="url(#grain-floor)" />
      <path d={FLOOR_LINES} stroke="var(--color-burn)" strokeOpacity={0.42} strokeWidth={0.014} fill="none" />
      {BOARD_CELLS.map(([r, c]) => (
        <CellLabel key={`${r},${c}`} cell={[r, c]} />
      ))}
    </>
  )
})

/** The top layer of the board, with the cut-out, burnt edges and the engraved title and motto. */
const FrameTop = memo(function FrameTop() {
  return (
    <>
      <path d={FRAME_PATH + CAVITY_PATH} fillRule="evenodd" fill="var(--color-wood)" filter="url(#frame-depth)" />
      <path d={FRAME_PATH + CAVITY_PATH} fillRule="evenodd" fill="#fff" filter="url(#grain-board)" />
      <path d={CAVITY_PATH} fill="none" stroke="var(--color-burn)" strokeWidth={0.03} strokeOpacity={0.85} />
      <path d={FRAME_PATH} fill="none" stroke="#8a6537" strokeWidth={0.02} strokeOpacity={0.6} />
      <Engraved x={3.36} y={-0.235} size={0.27} weight={800} spacing={0.2}>
        日历拼图
      </Engraved>
      <Engraved x={0.04} y={7.74} size={0.41} weight={800} anchor="start" spacing={-0.01}>
        每天都要拼一拼
      </Engraved>
    </>
  )
})

function Engraved({
  x,
  y,
  size,
  weight = 700,
  anchor = 'middle',
  spacing = 0,
  children,
}: {
  x: number
  y: number
  size: number
  weight?: number
  anchor?: 'start' | 'middle'
  spacing?: number
  children: string
}) {
  const common = {
    x,
    fontSize: size,
    fontWeight: weight,
    textAnchor: anchor,
    dominantBaseline: 'central' as const,
    letterSpacing: spacing,
  }
  return (
    <>
      <text {...common} y={y + 0.014} fill="#fff6e4" fillOpacity={0.55}>
        {children}
      </text>
      <text {...common} y={y} fill="var(--color-burn)" fillOpacity={0.9}>
        {children}
      </text>
    </>
  )
}

function CellLabel({ cell: [r, c] }: { cell: Cell }) {
  const label = labelAt(r, c)!
  const x = c + 0.5
  if (label.kind === 'weekday') {
    return (
      <>
        <Engraved x={x} y={r + 0.33} size={0.25}>
          星期
        </Engraved>
        <Engraved x={x} y={r + 0.68} size={0.27}>
          {WEEKDAYS[label.value]}
        </Engraved>
      </>
    )
  }
  const text = `${label.value}${label.kind === 'month' ? '月' : '日'}`
  return (
    <Engraved x={x} y={r + 0.52} size={text.length >= 3 ? 0.3 : 0.34} spacing={-0.012}>
      {text}
    </Engraved>
  )
}

/** Deterministic wobble, so each loop looks hand-drawn but stays the same between renders. */
function wobble(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function smoothPath(points: Point[]): string {
  let d = `M${points[0].x.toFixed(3)} ${points[0].y.toFixed(3)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += `C${c1.x.toFixed(3)} ${c1.y.toFixed(3)} ${c2.x.toFixed(3)} ${c2.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`
  }
  return d
}

/** A loop of red pen around a date, like circling it on a paper calendar. */
function loopPath(center: Point, seed: number, scale: number): string {
  const rand = wobble(seed)
  const start = -Math.PI * (0.55 + rand() * 0.15)
  const sweep = Math.PI * 2 + 0.5
  const points: Point[] = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = start + sweep * t
    const r = scale * (1 + (rand() - 0.5) * 0.07 + t * 0.07)
    points.push({ x: center.x + Math.cos(a) * 0.43 * r, y: center.y + Math.sin(a) * 0.39 * r })
  }
  return smoothPath(points)
}

function PenLoop({ cx, cy, seed, delay, twice }: { cx: number; cy: number; seed: number; delay: number; twice: boolean }) {
  const first = useMemo(() => loopPath({ x: cx, y: cy }, seed, 1), [cx, cy, seed])
  const second = useMemo(() => loopPath({ x: cx, y: cy }, seed + 17, 1.1), [cx, cy, seed])
  const stroke = {
    fill: 'none',
    stroke: 'var(--color-ink)',
    strokeWidth: 0.05,
    strokeLinecap: 'round' as const,
    pathLength: 1,
    className: 'pen-stroke',
    style: { mixBlendMode: 'multiply' as const },
  }
  return (
    <>
      <path d={first} {...stroke} strokeOpacity={0.88} style={{ ...stroke.style, animationDelay: `${delay}s` }} />
      {twice && (
        <path d={second} {...stroke} strokeOpacity={0.7} style={{ ...stroke.style, animationDelay: `${0.45 + delay}s` }} />
      )}
    </>
  )
}

/** Where the dragged piece would drop: its outline pencilled onto the floor. */
function Ghost({ cells }: { cells: Cell[] }) {
  const d = useMemo(() => roundedPath(outlinePolygon(cells, 0.05), 0.08, 0.04), [cells])
  return (
    <path
      d={d}
      fill="var(--color-burn)"
      fillOpacity={0.16}
      stroke="var(--color-burn)"
      strokeOpacity={0.55}
      strokeWidth={0.03}
      strokeDasharray="0.09 0.06"
    />
  )
}
