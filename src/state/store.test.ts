import { beforeEach, describe, expect, it } from 'vitest'
import { bounds } from '../game/geometry'
import { tableLayout } from '../game/layout'
import { PIECE_IDS, type PieceId } from '../game/pieces'
import { answerFor, shapeOf } from '../game/state'
import { targetFor, useGame, type TablePiece } from './store'

const fresh = useGame.getState()
beforeEach(() => {
  useGame.setState(fresh, true)
  useGame.getState().resetAll()
})

const game = () => useGame.getState()
const topmost = () => [...PIECE_IDS].sort((a, b) => game().pieces[b].z - game().pieces[a].z)[0]

describe('store', () => {
  it('brings a piece to the top when it is turned', () => {
    const p = game().pieces.I4
    game().turnPiece('I4', 1, { x: p.spot.kind === 'loose' ? p.spot.x + 0.5 : 0, y: p.spot.kind === 'loose' ? p.spot.y + 0.5 : 0 })
    expect(topmost()).toBe('I4')
  })

  it('brings a piece to the top when it is flipped or moved by keyboard', () => {
    game().flipPiece('U5', { x: 15, y: 4 })
    expect(topmost()).toBe('U5')
    game().nudgePiece('T5', 1, 0)
    expect(topmost()).toBe('T5')
  })

  it('drops a released piece into a free slot and clears the drop preview', () => {
    game().pickUp('L4')
    game().setGhost([[3, 2]])
    // L4 lies upright at home (XX / X. / X.); its box's top-left goes near (2, 3).
    expect(game().release('L4', { x: 2.2, y: 3.1 })).toBe(true)
    expect(game().pieces.L4.spot).toEqual({ kind: 'board', row: 3, col: 2 })
    expect(game().ghost).toBeNull()
    expect(game().draggingId).toBeNull()
  })

  it('sends every piece back to its place in the tray', () => {
    game().release('L4', { x: 2, y: 3 })
    game().resetAll()
    const homes = tableLayout('wide').homes
    for (const id of PIECE_IDS) {
      expect(game().pieces[id].spot).toEqual({ kind: 'loose', x: homes[id].x, y: homes[id].y })
    }
  })

  it('keeps the stacking order within the ten pieces however long you play', () => {
    for (let i = 0; i < 2000; i++) {
      const id = PIECE_IDS[(i * 7) % 10]
      if (i % 2) game().flipPiece(id, { x: 15, y: 4 })
      else game().nudgePiece(id, 0, 0)
    }
    const zs = PIECE_IDS.map((id) => game().pieces[id].z).sort((a, b) => a - b)
    expect(zs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(topmost()).toBe(PIECE_IDS[(1999 * 7) % 10])
  })

  it('puts a piece back exactly as it was when the drag is cancelled', () => {
    game().release('L4', { x: 2, y: 3 })
    const before = game().pieces.L4
    game().pickUp('L4')
    game().reorientInHand('L4', 1)
    game().reorientInHand('L4', 'flip')
    game().cancelDrag('L4')
    const after = game().pieces.L4
    expect([after.turns, after.flips, after.spot, after.tilt]).toEqual([before.turns, before.flips, before.spot, before.tilt])
    expect(game().draggingId).toBeNull()
  })
})

describe('timer', () => {
  it('starts afresh when the date to make changes', () => {
    game().trackTarget('2026-10-19')
    useGame.setState({ startedAt: 1, finishedAt: 2, usedAnswer: true })
    game().trackTarget('2026-10-20')
    expect([game().startedAt, game().finishedAt, game().usedAnswer]).toEqual([null, null, false])
  })

  it('keeps running while the date stays the same', () => {
    game().trackTarget('2026-10-19')
    useGame.setState({ startedAt: 1, finishedAt: 2 })
    game().trackTarget('2026-10-19')
    expect([game().startedAt, game().finishedAt]).toEqual([1, 2])
  })
})

describe('showAnswer', () => {
  it('does not count as using the answer on a board the player already solved', () => {
    const date = new Date(2026, 9, 19)
    game().setTarget(targetFor(date, new Date(2026, 9, 20)))
    const answer = answerFor(game().pieces, date)!
    const solved = { ...game().pieces }
    for (const id of PIECE_IDS) {
      const { turns, flips, row, col } = answer[id]
      solved[id] = { ...solved[id], turns, flips, spot: { kind: 'board', row, col } }
    }
    useGame.setState({ pieces: solved })
    game().showAnswer()
    expect(game().usedAnswer).toBe(false)
  })
})

describe('targetFor', () => {
  it('follows the clock when the chosen day is today', () => {
    expect(targetFor(new Date(2026, 9, 20), new Date(2026, 9, 20, 15, 30))).toEqual({ kind: 'today' })
  })

  it('pins any other day', () => {
    expect(targetFor(new Date(2026, 9, 21), new Date(2026, 9, 20))).toEqual({ kind: 'date', y: 2026, m: 10, d: 21 })
  })
})

describe('setLayout', () => {
  const center = (p: TablePiece) => {
    const { rows, cols } = bounds(shapeOf(p))
    const tl = p.spot.kind === 'loose' ? p.spot : { x: p.spot.col, y: p.spot.row }
    return { x: tl.x + cols / 2, y: tl.y + rows / 2 }
  }

  it('keeps loose pieces where they lie in the tray when only the tray size changes', () => {
    const small = tableLayout('tall', 'rows3', 0.6)
    const large = tableLayout('tall', 'rows3', 0.7)
    game().setLayout(small)
    game().resetAll()
    const ids: PieceId[] = ['T5', 'I4']
    // The player has moved T5 within the tray.
    const t5 = game().pieces.T5
    useGame.setState({ pieces: { ...game().pieces, T5: { ...t5, spot: { kind: 'loose', x: (t5.spot as { x: number }).x + 0.3, y: (t5.spot as { y: number }).y } } } })
    const before = Object.fromEntries(ids.map((id) => [id, center(game().pieces[id])]))
    game().setLayout(large)
    for (const id of ids) {
      const c = center(game().pieces[id])
      expect(c.x).toBeCloseTo(large.trayOrigin.x + ((before[id].x - small.trayOrigin.x) * 0.7) / 0.6, 6)
      expect(c.y).toBeCloseTo(large.trayOrigin.y + ((before[id].y - small.trayOrigin.y) * 0.7) / 0.6, 6)
    }
  })

  it('leaves pieces in the board alone when the tray size changes', () => {
    game().setLayout(tableLayout('tall', 'rows3', 0.6))
    game().release('L4', { x: 2, y: 3 })
    const spot = game().pieces.L4.spot
    game().setLayout(tableLayout('tall', 'rows3', 0.7))
    expect(game().pieces.L4.spot).toEqual(spot)
  })
})
