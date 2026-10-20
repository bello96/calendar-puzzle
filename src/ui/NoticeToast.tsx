import { useEffect, useState } from 'react'
import { useGame, type Notice } from '../state/store'

/** One short line of feedback (from hints) near the bottom of the table. */
export function NoticeToast() {
  const notice = useGame((s) => s.notice)
  const [shown, setShown] = useState<Notice | null>(null)

  useEffect(() => {
    if (!notice) return
    setShown(notice)
    const timer = setTimeout(() => setShown((s) => (s?.id === notice.id ? null : s)), 3400)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-10 z-[2000] flex justify-center px-4">
      {shown && (
        <p key={shown.id} className="rise-in rounded-lg bg-mat-deep/95 px-4 py-2 text-[15px] text-chalk shadow-lg shadow-black/25">
          {shown.text}
        </p>
      )}
    </div>
  )
}
