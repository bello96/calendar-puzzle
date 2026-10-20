import { useEffect, useMemo } from 'react'
import { status } from '../game/state'
import { targetFor, useGame } from '../state/store'
import { Button } from './Button'
import { play } from './sound'
import { dateParts, formatDate, useTable, useTargetDate } from './table-context'

function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60}秒` : `${s}秒`
}

/** Once every piece is in, the emptied tray says how it went. */
export function StatusPanel() {
  const { layout, cell, origin } = useTable()
  const date = useTargetDate()
  const pieces = useGame((s) => s.pieces)
  const dragging = useGame((s) => s.draggingId !== null)
  const startedAt = useGame((s) => s.startedAt)
  const finishedAt = useGame((s) => s.finishedAt)
  const usedAnswer = useGame((s) => s.usedAnswer)
  const st = useMemo(() => status(pieces, date), [pieces, date])

  useEffect(() => {
    if (!st.solved) return
    const game = useGame.getState()
    if (game.finishedAt === null) {
      game.markFinished()
      play('solved')
    }
  }, [st.solved])

  if (!st.complete || dragging) return null

  const tray = layout.tray
  const nextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    useGame.getState().setTarget(targetFor(d))
  }

  return (
    <section
      className="rise-in absolute z-[1500] flex flex-col items-center justify-center px-4 text-center"
      style={{
        left: (tray.left - origin.x) * cell,
        top: (tray.top - origin.y) * cell,
        width: (tray.right - tray.left) * cell,
        height: (tray.bottom - tray.top) * cell,
      }}
      aria-live="polite"
    >
      {st.solved ? (
        <>
          <h2 className="text-[clamp(30px,4vw,46px)] leading-tight font-bold tracking-wide">拼好了</h2>
          <p className="mt-2 text-xl tabular-nums">{formatDate(dateParts(date))}</p>
          <p className="mt-1.5 text-[15px] text-chalk-dim">
            {usedAnswer ? '这次看了答案' : startedAt && finishedAt ? `用时 ${duration(finishedAt - startedAt)}` : ''}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button tone="solid" onClick={nextDay}>
              接着拼下一天
            </Button>
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
