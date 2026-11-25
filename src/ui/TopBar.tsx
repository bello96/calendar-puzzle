import { lazy, Suspense, useEffect, useState, type ReactNode, type Ref } from 'react'
import { PIECE_IDS } from '../game/pieces'
import { PICK_ANY_DAY, targetFor, useGame } from '../state/store'
import { Button } from './Button'
import { useTargetDate } from './table-context'

/** The date with its calendar brings antd along, so it is fetched only if it is going to be shown. */
const DateField = lazy(() => import('./DateField').then((m) => ({ default: m.DateField })))

/**
 * A button that asks again before doing something that throws away the
 * player's work, when there is work to lose. The question goes away by
 * itself after a few seconds, or when focus moves on.
 */
function ConfirmButton({
  question,
  needed,
  onConfirm,
  children,
}: {
  question: string
  needed: () => boolean
  onConfirm: () => void
  children: ReactNode
}) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(false), 3000)
    return () => clearTimeout(timer)
  }, [asking])
  return (
    <Button
      className={`pointer-events-auto ${asking ? 'bg-chalk/15' : ''}`}
      onBlur={() => setAsking(false)}
      onClick={() => {
        if (asking || !needed()) {
          setAsking(false)
          onConfirm()
        } else setAsking(true)
      }}
    >
      {asking ? question : children}
    </Button>
  )
}

/**
 * On the left, how far along the board is and the way to start it over; on the
 * right, the rules. `onGuide` brings those up; it is handed the 玩法 button
 * when that was pressed from the keyboard.
 *
 * The bar lies over the top of the table and is see-through to the pointer but
 * for its buttons: the mat goes on under it, and pieces are put there and
 * picked up from there like anywhere else.
 */
export function TopBar({ onGuide, ref }: { onGuide: (from: HTMLElement | null) => void; ref?: Ref<HTMLElement> }) {
  const date = useTargetDate()
  const placed = useGame((s) => PIECE_IDS.filter((id) => s.pieces[id].spot.kind === 'board').length)
  const game = useGame.getState()

  return (
    <header
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-0.5 px-2 pt-2 pb-1 sm:gap-x-6 sm:px-5 sm:pt-3"
    >
      {/*
        Any other day, the day before or after, or back to today: all from the calendar.
        Hidden for now (PICK_ANY_DAY): the game makes today's date and no other.
      */}
      {PICK_ANY_DAY && (
        <Suspense fallback={null}>
          <span className="pointer-events-auto">
            <DateField date={date} onChange={(d) => game.setTarget(targetFor(d))} />
          </span>
        </Suspense>
      )}

      {/* The count starts as far in from the left as the words of 玩法 end short of the right. */}
      <div className="flex flex-wrap items-center gap-0.5">
        <span className="mr-1 pl-2 text-[14px] text-chalk-dim tabular-nums sm:mr-2 sm:pl-3" aria-live="polite">
          <span className="hidden sm:inline">已放入 </span>
          {placed} / {PIECE_IDS.length}
        </span>
        {/* With nothing in the board there is nothing to take back: the button then only scatters the tray afresh, and says so. */}
        <ConfirmButton
          question="确定全部收回？"
          needed={() => PIECE_IDS.some((id) => useGame.getState().pieces[id].spot.kind === 'board')}
          onConfirm={game.resetAll}
        >
          {placed > 0 ? '全部收回' : '全部打乱'}
        </ConfirmButton>
      </div>

      <Button
        className="pointer-events-auto ml-auto"
        aria-haspopup="dialog"
        onClick={(e) => onGuide(e.detail === 0 ? e.currentTarget : null)}
      >
        玩法
      </Button>
    </header>
  )
}
