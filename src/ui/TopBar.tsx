import { useEffect, useState, type ReactNode } from 'react'
import { PIECE_IDS } from '../game/pieces'
import { status } from '../game/state'
import { targetFor, useGame } from '../state/store'
import { Button } from './Button'
import { DateField } from './DateField'
import { useTargetDate } from './table-context'

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
      className={asking ? 'bg-chalk/15' : ''}
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

/** The date to make, and what you can do about it. */
export function TopBar() {
  const date = useTargetDate()
  const isToday = useGame((s) => s.target.kind === 'today')
  const placed = useGame((s) => PIECE_IDS.filter((id) => s.pieces[id].spot.kind === 'board').length)
  const sound = useGame((s) => s.sound)

  const choose = (d: Date) => useGame.getState().setTarget(targetFor(d))
  const shift = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    choose(d)
  }
  const game = useGame.getState()

  return (
    <header className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-0.5 px-2 pt-2 pb-1 sm:gap-x-6 sm:px-5 sm:pt-3">
      <div className="flex min-w-0 flex-wrap items-center gap-0.5">
        {/* A phone has only room for the date (with its year) and the buttons beside it. */}
        <span className="mr-1 hidden shrink-0 pl-1 text-[15px] text-chalk-dim sm:inline">{isToday ? '拼出今天' : '拼出'}</span>
        <DateField date={date} onChange={choose} />
        <Button aria-label="前一天" title="前一天" className="w-9 shrink-0 px-0! text-xl" onClick={() => shift(-1)}>
          ‹
        </Button>
        <Button aria-label="后一天" title="后一天" className="w-9 shrink-0 px-0! text-xl" onClick={() => shift(1)}>
          ›
        </Button>
        {!isToday && (
          <Button className="shrink-0 px-2! sm:px-3!" onClick={() => choose(new Date())}>
            <span className="hidden sm:inline">回到</span>今天
          </Button>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-0.5">
        <span className="mr-1 text-[14px] text-chalk-dim tabular-nums sm:mr-2" aria-live="polite">
          <span className="hidden sm:inline">已放入 </span>
          {placed} / {PIECE_IDS.length}
        </span>
        <Button onClick={game.showHint}>提示</Button>
        <ConfirmButton
          question="确定看答案？"
          needed={() => !status(useGame.getState().pieces, date).solved}
          onConfirm={game.showAnswer}
        >
          看答案
        </ConfirmButton>
        <ConfirmButton
          question="确定全部收回？"
          needed={() => PIECE_IDS.some((id) => useGame.getState().pieces[id].spot.kind === 'board')}
          onConfirm={game.resetAll}
        >
          全部收回
        </ConfirmButton>
        <Button
          aria-label={sound ? '关掉声音' : '打开声音'}
          title={sound ? '关掉声音' : '打开声音'}
          aria-pressed={sound}
          className="w-9 px-0!"
          onClick={game.toggleSound}
        >
          <SpeakerIcon muted={!sound} />
        </Button>
      </div>
    </header>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity={0.15} />
      {muted ? (
        <path d="M16 9.5l5 5m0-5l-5 5" />
      ) : (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
        </>
      )}
    </svg>
  )
}
