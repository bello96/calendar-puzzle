import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BOARD_CELLS, targetCells } from '../game/board'
import { bounds, type Cell } from '../game/geometry'
import { FRAME } from '../game/layout'
import { pieceFace } from '../game/outline'
import { PIECE_BY_ID, type PieceId } from '../game/pieces'
import { BoardBody, CellLabel, FrameTop, Ghost, PenLoop } from './Board'
import { Button } from './Button'
import { useTargetDate } from './table-context'

/**
 * How to play, a step to a page: what to make, then the three things a piece
 * can do. Each step is acted out in a small scene and said in one sentence;
 * a mouse and a touch screen get their own.
 */
const STEPS: { Scene: (props: { touch: boolean }) => ReactNode; text: (touch: boolean) => string }[] = [
  { Scene: GoalScene, text: () => '把十块拼块全部放进拼盘，只露出当天的月、日、星期' },
  { Scene: DragScene, text: () => '拖动拼块，把它放进拼盘' },
  { Scene: TurnScene, text: (touch) => (touch ? '轻点拼块，可以旋转' : '左键单击拼块，可以旋转') },
  { Scene: FlipScene, text: (touch) => (touch ? '点拼块上方的「翻面」，把它翻过来' : '右键单击拼块，可以翻面') },
]

/** How long the guide takes to fade away, and how soon after one press of its button another counts as a new one. */
const PAUSE = 250

/**
 * The rules, laid over the table when 玩法 is pressed in the top bar. There
 * is one way through: 下一步 on every page, 开始 on the last, after which the
 * guide fades away and `onDone` is called.
 */
export function Guide({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  // Told for a mouse or for a finger: a guess to begin with, then whichever is actually used.
  const [touch, setTouch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)
  const [leaving, setLeaving] = useState(false)
  const card = useRef<HTMLElement>(null)
  useEffect(() => card.current?.focus({ preventScroll: true }), [])

  // While it fades the guide is still in the way, so the second half of a double click on 开始
  // does not land on whatever lies on the table under the button.
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onDone, PAUSE)
    return () => clearTimeout(timer)
  }, [leaving, onDone])

  const { Scene, text } = STEPS[step]
  const last = step === STEPS.length - 1

  /** When the button was last pressed: a double click turns one page, not two. */
  const pressed = useRef(-Infinity)
  const onward = () => {
    const now = performance.now()
    if (leaving || now - pressed.current < PAUSE) return
    pressed.current = now
    if (last) setLeaving(true)
    else setStep(step + 1)
  }

  return (
    <div
      className={`guide-veil fixed inset-0 z-[3000] flex overflow-auto p-4 select-none ${leaving ? 'guide-leaving' : ''}`}
      onPointerDownCapture={(e) => setTouch(e.pointerType !== 'mouse')}
    >
      <section
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-step"
        className="guide-card rise-in m-auto rounded-[10px] bg-mat-deep text-center outline-none"
      >
        {/* The two lines engraved on the board itself. */}
        <h2 id="guide-title" className="guide-title indent-[0.2em] leading-tight font-bold tracking-[0.2em]">
          日历拼图
        </h2>
        <p className="guide-motto indent-[0.12em] tracking-[0.12em] text-chalk-dim">每天都要拼一拼</p>

        {/* Started afresh for every page, and when a page is retold for the other kind of pointer. */}
        <div key={`${step}-${touch}`} className="guide-stage relative overflow-hidden rounded-lg" aria-hidden>
          <div className="guide-scene">
            <div className="guide-grid" />
            <Scene touch={touch} />
          </div>
        </div>

        {/* A line only breaks at a comma. */}
        <p id="guide-step" className="guide-text flex items-center justify-center" aria-live="polite" aria-atomic="true">
          <span>
            <span className="sr-only">
              第 {step + 1} 步，共 {STEPS.length} 步：
            </span>
            {text(touch)
              .split('，')
              .map((clause, i, all) => (
                <span key={i} className="inline-block">
                  {i < all.length - 1 ? `${clause}，` : clause}
                </span>
              ))}
          </span>
        </p>

        <div className="guide-foot flex items-center justify-between">
          <ol className="guide-dots flex gap-2 pl-0.5" aria-hidden>
            {STEPS.map((_, i) => (
              <li key={i} className={`rounded-full ${i === step ? 'bg-chalk' : 'bg-chalk/25'}`} />
            ))}
          </ol>
          <Button tone="solid" className="guide-next" onClick={onward}>
            {last ? '开始' : '下一步'}
          </Button>
        </div>
      </section>
    </div>
  )
}

/*
 * The scenes. Each is 12 units wide and 8 tall, a unit being `--u` px (see
 * index.css) and one square of the mat's grid. What moves in them is driven
 * by the keyframes there.
 */

/** A length in units. */
const u = (n: number) => `calc(var(--u) * ${n})`

/** The board with a little room around it for its shadow, in cells. */
const ROOM = 0.4
const MINI = {
  x: FRAME.left - ROOM,
  y: FRAME.top - ROOM,
  w: FRAME.right - FRAME.left + 2 * ROOM,
  h: FRAME.bottom - FRAME.top + 2 * ROOM,
}
/** The small board is as tall as the scene: this many units to one of its cells. */
const MINI_CELL = 8 / MINI.h

/** The whole board in small, its picture starting `left` units into the scene. */
function MiniBoard({ left, children }: { left: number; children?: ReactNode }) {
  return (
    <svg
      className="absolute top-0"
      style={{ left: u(left), width: u(MINI.w * MINI_CELL), height: u(8) }}
      viewBox={`${MINI.x} ${MINI.y} ${MINI.w} ${MINI.h}`}
    >
      <BoardBody />
      {children}
      <FrameTop />
    </svg>
  )
}

/** Red pen around the day's three cells, as on the table, heavy enough to show at this size. */
function MiniLoops({ cells, wait = 0 }: { cells: Cell[]; wait?: number }) {
  return cells.map(([r, c], i) => (
    <PenLoop key={i} cx={c + 0.5} cy={r + 0.5} seed={r * 7 + c} delay={wait + i * 0.3} twice={false} weight={0.09} />
  ))
}

/** Everything in the board under wood, as when all ten pieces are in. */
const COVER = pieceFace(BOARD_CELLS)

/**
 * What to make: the board full, but for the day's three cells. The pieces are
 * drawn as one slab of wood, as how they fit is for the player to find out.
 * The three cells are shown again beside it, large enough to read.
 */
function GoalScene() {
  const date = useTargetDate()
  const open = useMemo(() => targetCells(date), [date])
  const holes = open.map(([r, c]) => `M${c} ${r}h1v1h-1z`).join('')
  return (
    <>
      <MiniBoard left={0.55}>
        <g className="guide-fade" style={{ animationDelay: '0.1s' }}>
          <path d={COVER + holes} fillRule="evenodd" fill="var(--color-piece)" />
          <path d={COVER + holes} fillRule="evenodd" fill="#fff" filter="url(#grain-I4)" />
          <path d={COVER + holes} fill="none" stroke="#5b391b" strokeOpacity={0.55} strokeWidth={0.035} />
        </g>
        <MiniLoops cells={open} wait={0.6} />
      </MiniBoard>
      {open.map(([r, c], i) => (
        <svg
          key={i}
          className="guide-tile rise-in absolute"
          style={{ left: u(8.75), top: u(0.125 + i * 2.625), width: u(2.5), height: u(2.5), animationDelay: `${0.75 + i * 0.3}s` }}
          viewBox={`${c - 0.1} ${r - 0.1} 1.2 1.2`}
        >
          <rect x={c} y={r} width={1} height={1} rx={0.05} fill="var(--color-wood-floor)" />
          <rect x={c} y={r} width={1} height={1} rx={0.05} fill="#fff" filter="url(#grain-floor)" />
          <rect x={c} y={r} width={1} height={1} rx={0.05} fill="none" stroke="var(--color-burn)" strokeOpacity={0.6} strokeWidth={0.025} />
          <CellLabel cell={[r, c]} />
          <PenLoop cx={c + 0.5} cy={r + 0.5} seed={r * 7 + c} delay={0.95 + i * 0.3} twice={false} />
        </svg>
      ))}
    </>
  )
}

/** A piece as it looks on the table, `cell` units to the cell, with its box's top-left at `x`, `y`. */
function Wood({
  id,
  cell,
  x,
  y,
  className = '',
  style,
  turning,
  pivot = [0, 0],
}: {
  id: PieceId
  cell: number
  x: number
  y: number
  /** For a piece that travels: it moves as a whole, shadow and all. */
  className?: string
  style?: CSSProperties
  /** For a piece that turns where it lies, around `pivot` (in its own cells): its shadow stays put. */
  turning?: string
  pivot?: [x: number, y: number]
}) {
  const def = PIECE_BY_ID[id]
  const box = bounds(def.cells)
  const face = useMemo(() => pieceFace(def.cells), [def])
  return (
    <div
      className={`guide-wood absolute ${className}`}
      style={{ '--c': u(cell), left: u(x), top: u(y), width: u(box.cols * cell), height: u(box.rows * cell), ...style } as CSSProperties}
    >
      <div className={`h-full w-full ${turning ?? ''}`} style={{ transformOrigin: `${u(pivot[0] * cell)} ${u(pivot[1] * cell)}` }}>
        <svg viewBox={`0 0 ${box.cols} ${box.rows}`} width="100%" height="100%" overflow="visible" className="block">
          <path d={face} fill="var(--color-piece)" />
          <path d={face} fill="#fff" filter={`url(#grain-${id})`} />
          <path d={face} fill="none" stroke="#5b391b" strokeOpacity={0.55} strokeWidth={0.022} />
        </svg>
      </div>
    </div>
  )
}

/**
 * The mouse pointer, or a fingertip on a touch screen, pointing at `x`, `y`.
 * It either carries the piece off (by `style`'s --dx, --dy) or clicks where it is, a ring spreading from each click.
 */
function Hand({ touch, x, y, does, style }: { touch: boolean; x: number; y: number; does: 'drag' | 'click'; style?: CSSProperties }) {
  return (
    <div className={`absolute size-0 ${does === 'drag' ? 'guide-drag-hand' : 'guide-click'}`} style={{ left: u(x), top: u(y), ...style }}>
      {does === 'click' && <span className="guide-ripple" />}
      {touch ? (
        <span className="guide-finger" />
      ) : (
        <svg className="guide-arrow" viewBox="0 0 14 21">
          <path
            d="M1 1v15.6l4-3.7 2.9 6.6 2.3-1-2.9-6.5h5.4z"
            fill="var(--color-chalk)"
            stroke="var(--color-mat-deep)"
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}

/** A mouse, the button in question lighting up at every click. */
function Mouse({ button }: { button: 'left' | 'right' }) {
  return (
    <svg
      className="absolute"
      style={{ left: u(8.9), top: u(2.5), width: u(2), height: u(3) }}
      viewBox="0 0 40 60"
      fill="none"
      stroke="var(--color-chalk)"
      strokeWidth={2.2}
    >
      <path
        className="guide-press"
        d={button === 'left' ? 'M5 25v-6A15 15 0 0 1 20 4v21z' : 'M35 25v-6A15 15 0 0 0 20 4v21z'}
        fill="var(--color-chalk)"
        stroke="none"
      />
      <rect x={5} y={4} width={30} height={52} rx={15} />
      <path d="M5 25h30M20 4v21" />
    </svg>
  )
}

/** The piece every scene plays with: the small L, which looks different turned and different again flipped. */
const PIECE = 'L4' satisfies PieceId
const SHAPE = PIECE_BY_ID[PIECE].cells
/** The cell of it that is pressed, and so turned around: the middle of its long side. */
const HELD: [x: number, y: number] = [1.5, 1.5]

/** Where the piece can be dropped in the small board, as the top-left of its box; between them they miss any one day. */
const SLOTS: Cell[] = [
  [3, 1],
  [3, 4],
]

/** Where the piece is dropped when `open` are the day's cells: somewhere that leaves all three showing. */
export function landingFor(open: readonly Cell[]): { slot: Cell; cells: Cell[] } {
  const at = (slot: Cell) => SHAPE.map(([r, c]): Cell => [r + slot[0], c + slot[1]])
  const clear = (slot: Cell) => !at(slot).some(([r, c]) => open.some((o) => o[0] === r && o[1] === c))
  const slot = SLOTS.find(clear) ?? SLOTS[0]
  return { slot, cells: at(slot) }
}

/** Moving: a piece is carried from the mat into the board, and settles into the cells it was held over. */
function DragScene({ touch }: { touch: boolean }) {
  const date = useTargetDate()
  const open = useMemo(() => targetCells(date), [date])
  const landing = useMemo(() => landingFor(open), [open])

  const left = 0.3
  const from = { x: 8.5, y: 2.3 }
  const [row, col] = landing.slot
  const to = { x: left + (col - MINI.x) * MINI_CELL, y: (row - MINI.y) * MINI_CELL }
  const travel = { '--c': u(MINI_CELL), '--dx': u(to.x - from.x), '--dy': u(to.y - from.y) } as CSSProperties
  return (
    <>
      <MiniBoard left={left}>
        <MiniLoops cells={open} />
        <g className="guide-ghost">
          <Ghost cells={landing.cells} />
        </g>
      </MiniBoard>
      <Wood id={PIECE} cell={MINI_CELL} x={from.x} y={from.y} className="guide-drag" style={travel} />
      <Hand touch={touch} x={from.x + HELD[0] * MINI_CELL} y={from.y + HELD[1] * MINI_CELL} does="drag" style={travel} />
    </>
  )
}

/** Units to the cell of the piece shown close up. */
const CLOSE = 1.4

/** Turning: every click (or tap) on a piece turns it a quarter, around the cell that was clicked. */
function TurnScene({ touch }: { touch: boolean }) {
  const at = touch ? { x: 6, y: 4 } : { x: 4.7, y: 4 }
  return (
    <>
      <Wood id={PIECE} cell={CLOSE} x={at.x - HELD[0] * CLOSE} y={at.y - HELD[1] * CLOSE} turning="guide-turn" pivot={HELD} />
      <Hand touch={touch} x={at.x} y={at.y} does="click" />
      {!touch && <Mouse button="left" />}
    </>
  )
}

/**
 * Flipping: a right click on the piece or, on a touch screen, the 翻面 button
 * that floats above the piece last touched. It turns over around the cell
 * that was clicked (the one nearest its middle, with the button).
 */
function FlipScene({ touch }: { touch: boolean }) {
  const at = touch ? { x: 6, y: 5.5 } : { x: 4.7, y: 4 }
  return (
    <>
      <Wood id={PIECE} cell={CLOSE} x={at.x - HELD[0] * CLOSE} y={at.y - HELD[1] * CLOSE} turning="guide-flip" pivot={HELD} />
      {touch ? (
        <>
          <div className="guide-pill absolute" style={{ left: u(3.6), top: u(1.5), width: u(4.8), height: u(1.5) }}>
            <span>旋转</span>
            <span>翻面</span>
          </div>
          <Hand touch x={7.2} y={2.25} does="click" />
        </>
      ) : (
        <>
          <Hand touch={false} x={at.x} y={at.y} does="click" />
          <Mouse button="right" />
        </>
      )}
    </>
  )
}
