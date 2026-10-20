import { domMin, LazyMotion } from 'motion/react'
import { Table } from './ui/Table'
import { TopBar } from './ui/TopBar'
import { WoodDefs } from './ui/WoodDefs'

export function App() {
  return (
    // Pieces only need motion values drawn to the DOM, so load motion's smallest feature set.
    <LazyMotion features={domMin} strict>
      <main className="flex h-full flex-col">
        <h1 className="sr-only">日历拼图</h1>
        <WoodDefs />
        <TopBar />
        <Table />
      </main>
    </LazyMotion>
  )
}
