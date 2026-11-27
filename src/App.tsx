import { domMin, LazyMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Rect } from './game/placement'
import { Guide } from './ui/Guide'
import { Table } from './ui/Table'
import { TopBar } from './ui/TopBar'
import { WoodDefs } from './ui/WoodDefs'

const sameRects = (a: readonly Rect[], b: readonly Rect[]) =>
  a.length === b.length &&
  a.every((r, i) => r.left === b[i].left && r.top === b[i].top && r.right === b[i].right && r.bottom === b[i].bottom)

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

  // The top bar lies over the top of the table, corner on corner. The table is told how tall the bar
  // is, to lay its board out clear of it, and where in the bar something is written (the box of each
  // thing in it, in px from that corner), to keep loose pieces off the words.
  const bar = useRef<HTMLElement>(null)
  const [barHeight, setBarHeight] = useState(0)
  const [barWords, setBarWords] = useState<readonly Rect[]>([])
  useLayoutEffect(() => {
    const el = bar.current!
    const measure = () => {
      setBarHeight(el.offsetHeight)
      const corner = el.getBoundingClientRect()
      const words = [...el.children].map((child): Rect => {
        const box = child.getBoundingClientRect()
        return { left: box.left - corner.left, top: box.top - corner.top, right: box.right - corner.left, bottom: box.bottom - corner.top }
      })
      setBarWords((was) => (sameRects(was, words) ? was : words))
    }
    // The bar's size changes with the window, and the size of each thing in it with what it says.
    // A thing that comes into the bar later, or goes from it, moves the rest along without any of
    // them changing size, so that is watched for too.
    const sizes = new ResizeObserver(measure)
    const watch = () => {
      sizes.disconnect()
      sizes.observe(el)
      for (const child of el.children) sizes.observe(child)
      measure()
    }
    const comings = new MutationObserver(watch)
    comings.observe(el, { childList: true })
    watch()
    return () => {
      sizes.disconnect()
      comings.disconnect()
    }
  }, [])

  return (
    // Pieces only need motion values drawn to the DOM, so load motion's smallest feature set.
    <LazyMotion features={domMin} strict>
      <main className="relative h-full" inert={guiding}>
        <h1 className="sr-only">日历拼图</h1>
        <WoodDefs />
        <TopBar ref={bar} onGuide={showGuide} />
        <Table bar={barHeight} words={barWords} />
      </main>
      {guiding && <Guide onDone={endGuide} />}
    </LazyMotion>
  )
}
