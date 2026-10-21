import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bounds } from '../game/geometry'
import { tableLayout } from '../game/layout'
import { PIECE_IDS, type PieceId } from '../game/pieces'
import { answerFor, centerOf, shapeOf } from '../game/state'
import { seeded } from '../game/testing/random'
import { targetDate, targetFor, useGame, type TablePiece } from './store'

const fresh = useGame.getState()
beforeEach(() => {
  // The pieces are dealt at random; the same deals every run.
  vi.spyOn(Math, 'random').mockImplementation(seeded(1))
  useGame.setState(fresh, true)
  useGame.getState().resetAll()
})

const game = () => useGame.getState()
const topmost = () => [...PIECE_IDS].sort((a, b) => game().pieces[b].z - game().pieces[a].z)[0]

/** Every piece lies loose in the tray, face up. */
function expectAllInTray() {
  for (const id of PIECE_IDS) {
    const p = game().pieces[id]
    expect(p.spot.kind, id).toBe('loose')
    expect(game().layout.inTray(centerOf(p)), id).toBe(true)
    expect(p.flips % 2, id).toBe(0)
  }
}

describe('store', () => {
  it('brings a piece to the top when it is turned', () => {
    const p = game().pieces.I4
    game().turnPiece('I4', 1, { x: p.spot.kind === 'loose' ? p.spot.x + 0.5 : 0, y: p.spot.kind === 'loose' ? p.spot.y + 0.5 : 0 })
    expect(topmost()).toBe('I4')
  })

  it('brings a piece to the top when it is flipped or dropped', () => {
    game().flipPiece('U5', { x: 15, y: 4 })
    expect(topmost()).toBe('U5')
    game().release('T5', { x: 2, y: 3 })
    expect(topmost()).toBe('T5')
  })

  it('drops a released piece into a free slot and clears the drop preview', () => {
    game().pickUp('L4')
    game().setGhost([[3, 2]])
    // However L4 lies, its box's top-left goes near (2, 3), and it fits there.
    expect(game().release('L4', { x: 2.2, y: 3.1 })).toBe(true)
    expect(game().pieces.L4.spot).toEqual({ kind: 'board', row: 3, col: 2 })
    expect(game().ghost).toBeNull()
    expect(game().draggingId).toBeNull()
  })

  it('scatters every piece over the tray afresh when they are all taken back', () => {
    const before = game().pieces
    game().release('L4', { x: 2, y: 3 })
    game().flipPiece('U5', { x: 15, y: 4 })
    game().resetAll()
    expectAllInTray()
    // Each lies somewhere new, even the ones never touched, and they set off one after another.
    for (const id of PIECE_IDS) {
      const [a, b] = [before[id].spot, game().pieces[id].spot] as { x: number; y: number }[]
      expect(Math.hypot(a.x - b.x, a.y - b.y), id).toBeGreaterThan(0.05)
    }
    expect(PIECE_IDS.map((id) => game().pieces[id].motion)).toEqual(PIECE_IDS.map((_, i) => ({ kind: 'travel', delay: i * 0.035 })))
  })

  it('turns each piece the short way round to how it is dealt', () => {
    useGame.setState({ pieces: { ...game().pieces, I4: { ...game().pieces.I4, turns: 41 } } })
    game().resetAll()
    expect(Math.abs(game().pieces.I4.turns - 41)).toBeLessThanOrEqual(2)
  })

  it('keeps the stacking order within the ten pieces however long you play', () => {
    for (let i = 0; i < 2000; i++) {
      const id = PIECE_IDS[(i * 7) % 10]
      if (i % 2) game().flipPiece(id, { x: 15, y: 4 })
      else game().turnPiece(id, 1, { x: 15, y: 4 })
    }
    const zs = PIECE_IDS.map((id) => game().pieces[id].z).sort((a, b) => a - b)
    expect(zs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(topmost()).toBe(PIECE_IDS[(1999 * 7) % 10])
  })
})

describe('raise', () => {
  /** Lay a piece loose and straight with its box's top-left at (x, y). */
  const lay = (id: PieceId, x: number, y: number) => {
    const p = game().pieces[id]
    useGame.setState({ pieces: { ...game().pieces, [id]: { ...p, turns: 0, flips: 0, tilt: 0, spot: { kind: 'loose', x, y } } } })
  }

  // Laid on top of the empty board, well away from the pieces dealt into the tray.
  it('brings a piece out from under another to the top, without moving it', () => {
    lay('L4', 1, 2)
    lay('T5', 1.5, 2.5)
    const before = game().pieces.L4
    expect(game().raise('L4')).toBe(true)
    expect(topmost()).toBe('L4')
    expect(game().pieces.L4).toEqual({ ...before, z: 9 })
    // Now nothing lies on it: the next click turns it.
    expect(game().raise('L4')).toBe(false)
  })

  it('leaves a piece with nothing on it as it is', () => {
    lay('L4', 1, 2)
    lay('T5', 1.5, 2.5)
    const before = game().pieces
    expect(game().raise('T5')).toBe(false)
    expect(game().raise('I4')).toBe(false)
    expect(game().pieces).toBe(before)
  })

  it('stacks pieces in the board and out of it alike', () => {
    game().release('L4', { x: 2, y: 3 })
    lay('T5', 2.3, 3.2)
    // The piece in the board went on top last; the loose one lying across it comes up first...
    expect(game().raise('T5')).toBe(true)
    // ...and then the one in the board comes back up over it.
    expect(game().raise('L4')).toBe(true)
    expect(topmost()).toBe('L4')
    expect(game().pieces.L4.spot).toEqual({ kind: 'board', row: 3, col: 2 })
  })

  it('never finds pieces side by side in the board lying on each other', () => {
    const { I4, L4 } = game().pieces
    useGame.setState({
      pieces: {
        ...game().pieces,
        I4: { ...I4, turns: 0, flips: 0, tilt: 0, spot: { kind: 'board', row: 0, col: 0 } },
        L4: { ...L4, turns: 0, flips: 0, tilt: 0, spot: { kind: 'board', row: 1, col: 0 } },
      },
    })
    expect(game().raise('I4')).toBe(false)
  })

  it('judges pieces in a phone tray at the size they are drawn', () => {
    // The bar and the big L overlap at full size, but not drawn at half size in the tray below the board
    // (off to the side, clear of the other pieces).
    game().setLayout(tableLayout('tall', 'strip', 0.5))
    lay('I4', 20, 10)
    lay('L5', 20, 10.7)
    expect(game().raise('I4')).toBe(false)
    game().setLayout(tableLayout('wide'))
    lay('I4', 20, 10)
    lay('L5', 20, 10.7)
    expect(game().raise('I4')).toBe(true)
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

describe('setTarget', () => {
  it('empties the board for another day, scattering every piece over the tray', () => {
    game().release('L4', { x: 2, y: 3 })
    game().release('T5', { x: 3.4, y: 0.2 })
    useGame.setState({ startedAt: 1 })
    const tomorrow = targetDate(game().target)
    tomorrow.setDate(tomorrow.getDate() + 1)
    game().setTarget(targetFor(tomorrow))
    expectAllInTray()
    expect(game().startedAt).toBeNull()
  })

  it('leaves the pieces be when the same day is picked again', () => {
    game().release('L4', { x: 2, y: 3 })
    const before = game().pieces
    game().setTarget(targetFor(targetDate(game().target)))
    expect(game().pieces).toBe(before)
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
    const small = tableLayout('tall', 'block', 0.6)
    const large = tableLayout('tall', 'block', 0.7)
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

  it('deals the loose pieces into the new tray when the screen turns, leaving those in the board', () => {
    game().release('L4', { x: 2, y: 3 })
    const placed = game().pieces.L4.spot
    game().setLayout(tableLayout('tall', 'strip', 0.6))
    expect(game().pieces.L4.spot).toEqual(placed)
    for (const id of PIECE_IDS) {
      if (id === 'L4') continue
      expect(game().pieces[id].spot.kind).toBe('loose')
      expect(game().layout.inTray(centerOf(game().pieces[id]))).toBe(true)
    }
  })

  it('leaves pieces in the board alone when the tray size changes', () => {
    game().setLayout(tableLayout('tall', 'block', 0.6))
    game().release('L4', { x: 2, y: 3 })
    const spot = game().pieces.L4.spot
    game().setLayout(tableLayout('tall', 'block', 0.7))
    expect(game().pieces.L4.spot).toEqual(spot)
  })
})
