import { useEffect, useMemo } from 'react'
import { FRAME } from '../game/layout'
import { status } from '../game/state'
import { PICK_ANY_DAY, targetFor, useGame } from '../state/store'
import { Button } from './Button'
import { celebrate } from './confetti'
import { DayPage } from './DayPage'
import { dateParts, formatDate, useTable, useTargetDate } from './table-context'

export function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}小时${m % 60}分`
  return m ? `${m}分${s % 60}秒` : `${s}秒`
}

/**
 * What the time taken was as long as: something everyone has sat through, to say after it. A `|`
 * marks where it may break besides its commas (and is not shown), so that beside the page on a phone
 * held sideways it breaks as one would say it, never in the middle of a word.
 */
export function timeQuip(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '比热杯牛奶|还快'
  if (min < 3) return '比泡一碗面|还快'
  if (min < 5) return '一首歌的|工夫'
  if (min < 10) return '一杯咖啡的|工夫'
  if (min < 25) return '一集动画的|工夫'
  if (min < 45) return '一节课的|时间，值了'
  if (min < 120) return '抵得上|一部电影，精彩'
  return '慢工出细活，坚持到底'
}

/** A sentence that may only break after its commas, or where a `|` says, as on a narrow screen. */
function Halves({ children }: { children: string }) {
  return children.split(/(?<=，)|\|/).map((part, i) => (
    <span key={i} className="inline-block">
      {part}
    </span>
  ))
}

/** The time taken with its figures large and its units (分, 秒) at the size of the words. */
function Figures({ ms }: { ms: number }) {
  return duration(ms)
    .split(/(\d+)/)
    .filter(Boolean)
    .map((part, i) => (/\d/.test(part) ? <span key={i} className="finish-figure">{part}</span> : part))
}

/*
 * Chalk marks on the mat, as someone would scribble round what is written on a blackboard. Each
 * stroke draws itself in (pen-stroke), `delay` seconds after the panel appears.
 */
const chalk = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1, className: 'pen-stroke' }

/** Two quick strokes under the headline. */
function Underline() {
  return (
    <svg className="finish-underline" viewBox="0 0 64 4" aria-hidden>
      <path d="M1.5 2.2C14 1.2 33 1 62 1.6" strokeWidth={0.9} style={{ animationDelay: '0.35s' }} {...chalk} />
      <path d="M8 3.4C24 2.7 41 2.6 55 3" strokeWidth={0.7} strokeOpacity={0.7} style={{ animationDelay: '0.6s' }} {...chalk} />
    </svg>
  )
}

/**
 * An arrow from the start of the note, swinging out to the left and back up to the figures of the
 * time: drawn in the space under 用时 and between the two lines, so it takes none of the note's width.
 * Its units are tenths of the note's em.
 */
function Arrow() {
  return (
    <svg className="finish-arrow" viewBox="0 0 19 17" aria-hidden>
      <path d="M12.6 14.3C2 16 11.9 5.6 16.5 1.8" strokeWidth={1.1} style={{ animationDelay: '1.25s' }} {...chalk} />
      <path d="M12.1 2.6L16.5 1.8L15 6" strokeWidth={1.1} style={{ animationDelay: '1.65s' }} {...chalk} />
    </svg>
  )
}

/** How long after the last piece goes in the paper flies, in ms: time to see the board is done before anything bursts. */
const BEAT = 1000

/** Once every piece is in, the emptied tray says how it went. */
export function StatusPanel() {
  const { layout, cell, origin, visible } = useTable()
  const date = useTargetDate()
  const pieces = useGame((s) => s.pieces)
  const dragging = useGame((s) => s.draggingId !== null)
  const startedAt = useGame((s) => s.startedAt)
  const finishedAt = useGame((s) => s.finishedAt)
  const usedAnswer = useGame((s) => s.usedAnswer)
  const st = useMemo(() => status(pieces, date), [pieces, date])

  // The last piece has gone in: the time is taken there and then, and a beat later there is paper
  // in the air. Not if the board is taken apart again within that beat.
  useEffect(() => {
    if (!st.solved) return
    const game = useGame.getState()
    if (game.finishedAt !== null) return
    game.markFinished()
    const timer = setTimeout(celebrate, BEAT)
    return () => clearTimeout(timer)
  }, [st.solved])

  if (!st.complete || dragging) return null

  // Beside the board, the tray. Under it (a phone held upright) the tray is small, so all the mat
  // there is below the board: the window's width, down to a little short of its bottom edge.
  const room =
    layout.mode === 'wide'
      ? layout.tray
      : { left: visible.left, right: visible.right, top: FRAME.bottom + 0.2, bottom: visible.bottom - 32 / cell }
  const nextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    useGame.getState().setTarget(targetFor(d))
  }
  const took = startedAt && finishedAt ? finishedAt - startedAt : null

  return (
    // All in it is sized from the room it has (cq units), as the table is from the window.
    <section
      className="rise-in finish-room absolute z-[1500] flex flex-col items-center justify-center px-4 text-center"
      style={{
        left: (room.left - origin.x) * cell,
        top: (room.top - origin.y) * cell,
        width: (room.right - room.left) * cell,
        height: (room.bottom - room.top) * cell,
      }}
      aria-live="polite"
    >
      {st.solved ? (
        // The words come first for a screen reader; on screen the day's page is to their left.
        <div className="finish">
          <div className="finish-words">
            <h2 className="finish-title">
              <Halves>恭喜，拼好了！</Halves>
              <Underline />
            </h2>
            {usedAnswer ? (
              <p className="finish-time">这次看了答案</p>
            ) : took !== null ? (
              <>
                <p className="finish-time">
                  用时 <Figures ms={took} />
                </p>
                {/* A note in hand, added a moment later, with an arrow back to the time. */}
                <p className="finish-note">
                  <Arrow />
                  <span className="finish-note-text">
                    <Halves>{timeQuip(took)}</Halves>
                  </span>
                </p>
              </>
            ) : null}
            {/*
              One puzzle a day: there is no going on to the next until it comes, and nothing to press here.
              Starting today's over is 全部收回 in the top bar.
            */}
            {PICK_ANY_DAY ? (
              <div className="finish-next">
                <Button tone="solid" onClick={nextDay}>
                  接着拼下一天
                </Button>
              </div>
            ) : (
              <p className="finish-next">
                <Halves>明天再来，新的一天仍然要拼！</Halves>
              </p>
            )}
          </div>
          <DayPage date={date} />
        </div>
      ) : (
        <>
          <h2 className="text-[clamp(24px,3vw,34px)] leading-tight font-bold">还差一点</h2>
          <p className="mt-3 text-[17px]">
            现在露出的是 {st.shown ? formatDate(st.shown) : '几个凑不成日期的格子'}
          </p>
          <p className="mt-1 text-[15px] text-chalk-dim">要露出的是 {formatDate(dateParts(date))}</p>
          <div className="mt-5">
            <Button tone="solid" onClick={() => useGame.getState().showHint()}>
              看看哪块不对
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
