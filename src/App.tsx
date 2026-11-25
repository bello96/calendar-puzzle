import { domMin, LazyMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Guide } from './ui/Guide'
import { Table } from './ui/Table'
import { TopBar } from './ui/TopBar'
import { WoodDefs } from './ui/WoodDefs'

export function App() {
  // The rules come up when asked for, with 玩法 in the top bar; the table is out of reach while they are up.
  const [guiding, setGuiding] = useState(false)
  /** The 玩法 button, if it was pressed from the keyboard: the focus goes back to it when the guide closes. */
  const opener = useRef<HTMLElement | null>(null)
  const showGuide = useCallback((from: HTMLElement | null) => {
    opener.current = from
    setGuiding(true)
  }, [])
  const endGuide = useCallback(() => setGuiding(false), [])
  useEffect(() => {
    if (!guiding) opener.current?.focus({ preventScroll: true })
  }, [guiding])

  // The top bar lies over the top of the table, which is told how tall it is to lay its board out clear of it.
  const bar = useRef<HTMLElement>(null)
  const [barHeight, setBarHeight] = useState(0)
  useLayoutEffect(() => {
    const el = bar.current!
    const measure = () => setBarHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    // Pieces only need motion values drawn to the DOM, so load motion's smallest feature set.
    <LazyMotion features={domMin} strict>
      <main className="relative h-full" inert={guiding}>
        <h1 className="sr-only">日历拼图</h1>
        <WoodDefs />
        <TopBar ref={bar} onGuide={showGuide} />
        <Table bar={barHeight} />
      </main>
      {guiding && <Guide onDone={endGuide} />}
    </LazyMotion>
  )
}
