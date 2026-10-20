import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PIECE_IDS } from '../game/pieces'
import { status } from '../game/state'
import { targetFor, useGame } from '../state/store'
import { Button } from './Button'
import { dateParts, formatDate, useTargetDate } from './table-context'

const pad = (n: number) => String(n).padStart(2, '0')

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
  const picker = useRef<HTMLInputElement>(null)

  const choose = (d: Date) => useGame.getState().setTarget(targetFor(d))
  const shift = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    choose(d)
  }
  const game = useGame.getState()

  return (
    <header className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-0.5 px-2 pt-2 pb-1 sm:gap-x-6 sm:px-5 sm:pt-3">
      <div className="flex min-w-0 items-center gap-0.5">
        <span className="mr-1 shrink-0 pl-1 text-[15px] text-chalk-dim">{isToday ? '拼出今天' : '拼出'}</span>
        <span className="relative">
          <button
            type="button"
            className="rounded-md px-1.5 py-1 text-[19px] leading-tight font-bold tracking-wide whitespace-nowrap tabular-nums hover:bg-chalk/10 focus-visible:outline-2 focus-visible:outline-chalk sm:text-[22px]"
            onClick={() => {
              try {
                picker.current?.showPicker()
              } catch {
                picker.current?.focus()
              }
            }}
            title="选一个日期"
          >
            {formatDate(dateParts(date))}
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0 opacity-0"
            value={`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split('-').map(Number)
              if (y && m && d) choose(new Date(y, m - 1, d))
            }}
          />
        </span>
        <Button aria-label="前一天" title="前一天" className="w-9 px-0! text-xl" onClick={() => shift(-1)}>
          ‹
        </Button>
        <Button aria-label="后一天" title="后一天" className="w-9 px-0! text-xl" onClick={() => shift(1)}>
          ›
        </Button>
        {!isToday && (
          <Button className="px-2! sm:px-3!" onClick={() => choose(new Date())}>
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
