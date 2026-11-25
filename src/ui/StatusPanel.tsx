import { useEffect, useMemo } from 'react'
import { FRAME } from '../game/layout'
import { status } from '../game/state'
import { PICK_ANY_DAY, targetFor, useGame } from '../state/store'
import { Button } from './Button'
import { celebrate } from './confetti'
import { play } from './sound'
import { dateParts, formatDate, useTable, useTargetDate } from './table-context'

function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60}秒` : `${s}秒`
}

/** Something kind to say about a finished board. Each is two short halves, so it can break at its comma on a narrow screen. */
const CHEERS = [
  '十块木头严丝合缝，漂亮！',
  '今天这一天，被你拼得明明白白。',
  '又解开一天，给自己鼓个掌。',
  '不急不躁拼到最后，真有你的。',
  '眼力和耐心都在线，今天状态不错。',
  '一份小小的成就感，已到账。',
  '这思路，这手感，木头都服气。',
  '今天拼好了，今天也会好好的。',
]

/** The cheer for the day `date` falls on: the same all that day, another the next. */
export function cheerFor(date: Date): string {
  const day = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return CHEERS[day % CHEERS.length]
}

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

  // The moment the last piece goes in: a chime, and paper in the air.
  useEffect(() => {
    if (!st.solved) return
    const game = useGame.getState()
    if (game.finishedAt === null) {
      game.markFinished()
      play('solved')
      celebrate()
    }
  }, [st.solved])

  if (!st.complete || dragging) return null

  // Beside the board, the tray. Under it (a phone held upright) the tray is small, so all the mat
  // there is below the board: the window's width, down to the line of hints along the bottom.
  const room =
    layout.mode === 'wide'
      ? layout.tray
      : { left: visible.left, right: visible.right, top: FRAME.bottom + 0.2, bottom: visible.bottom - 32 / cell }
  const nextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    useGame.getState().setTarget(targetFor(d))
  }

  return (
    // What it says when the day is made is sized from the width it has (cqw), as the table is from the window.
    <section
      className="rise-in @container absolute z-[1500] flex flex-col items-center justify-center px-4 text-center"
      style={{
        left: (room.left - origin.x) * cell,
        top: (room.top - origin.y) * cell,
        width: (room.right - room.left) * cell,
        height: (room.bottom - room.top) * cell,
      }}
      aria-live="polite"
    >
      {st.solved ? (
        <>
          <h2 className="text-[clamp(28px,7cqw,64px)] leading-[1.2] font-bold tracking-wide">恭喜，拼好了！</h2>
          <p className="mt-[clamp(4px,1cqw,10px)] flex flex-wrap items-baseline justify-center gap-x-[0.7em] text-[clamp(17px,3cqw,24px)] tabular-nums">
            <span>{formatDate(dateParts(date))}</span>
            <span className="text-[clamp(14px,2.3cqw,19px)] text-chalk-dim">
              {usedAnswer ? '这次看了答案' : startedAt && finishedAt ? `用时 ${duration(finishedAt - startedAt)}` : ''}
            </span>
          </p>
          <p className="mt-[clamp(10px,2.9cqw,28px)] text-[clamp(16px,2.95cqw,27px)]">
            {cheerFor(date)
              .split('，')
              .map((half, i, all) => (
                <span key={i} className="inline-block">
                  {i < all.length - 1 ? `${half}，` : half}
                </span>
              ))}
          </p>
          {/* One puzzle a day: there is no going on to the next until it comes. */}
          {!PICK_ANY_DAY && (
            <p className="mt-[clamp(0px,0.5cqw,5px)] text-[clamp(14px,2.45cqw,22px)] text-chalk-dim">明天再来，继续拼新的一天。</p>
          )}
          <div className="mt-[clamp(8px,3cqw,28px)] flex flex-wrap justify-center gap-2">
            {PICK_ANY_DAY && (
              <Button tone="solid" onClick={nextDay}>
                接着拼下一天
              </Button>
            )}
            <Button onClick={() => useGame.getState().resetAll()}>全部收回</Button>
          </div>
        </>
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
