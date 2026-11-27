import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bounds } from '../game/geometry'
import { tableLayout } from '../game/layout'
import { PIECE_IDS, type PieceId } from '../game/pieces'
import type { Rect } from '../game/placement'
import { boxAround } from '../game/room'
import { cellSquares } from '../game/stacking'
import { answerFor, centerOf, shapeOf } from '../game/state'
import { seeded } from '../game/testing/random'
import { targetDate, targetFor, useGame, type Store, type TablePiece } from './store'

const fresh = useGame.getState()
beforeEach(() => {
  // The pieces are dealt at random; the same deals every run.
  vi.spyOn(Math, 'random').mockImplementation(seeded(1))
  useGame.setState(fresh, true)
  useGame.getState().resetAll()
})

const game = () => useGame.getState()
const topmost = () => [...PIECE_IDS].sort((a, b) => game().pieces[b].z - game().pieces[a].z)[0]

/** Lay a piece loose and straight with its box's top-left at (x, y), turned `turns` quarter turns from how it is cut. */
const lay = (id: PieceId, x: number, y: number, turns = 0) => {
  const p = game().pieces[id]
  useGame.setState({ pieces: { ...game().pieces, [id]: { ...p, turns, flips: 0, tilt: 0, spot: { kind: 'loose', x, y } } } })
}

/** Every piece lies loose in the tray, face up. */
function expectAllInTray(state: Store = game()) {
  for (const id of PIECE_IDS) {
    const p = state.pieces[id]
    expect(p.spot.kind, id).toBe('loose')
    expect(state.layout.inTray(centerOf(p)), id).toBe(true)
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

describe('the day to make', () => {
  afterEach(() => vi.useRealTimers())

  /** The game as the page starts it at `now`. */
  async function openedAt(now: Date) {
    vi.useFakeTimers({ toFake: ['Date'], now })
    vi.resetModules()
    return import('./store')
  }

  it('stays the day the page was opened on when midnight passes', async () => {
    const page = await openedAt(new Date(2026, 10, 25, 23, 59, 50))
    vi.setSystemTime(new Date(2026, 10, 26, 0, 0, 30))
    expect(page.targetDate(page.useGame.getState().target).toDateString()).toBe('Wed Nov 25 2026')
  })

  it('is the new day once the page is opened again', async () => {
    await openedAt(new Date(2026, 10, 25, 23, 59, 50))
    const again = await openedAt(new Date(2026, 10, 26, 0, 0, 30))
    expect(again.targetDate(again.useGame.getState().target).toDateString()).toBe('Thu Nov 26 2026')
  })
})

describe('the room for loose pieces', () => {
  /** Each cell of the piece as it is drawn, at whatever angle it has come to rest: the upright box round it. */
  const parts = (id: PieceId) => cellSquares({ ...game().pieces[id], scale: 1 }).map(boxAround)
  /** The box round the whole piece as it is drawn, at `scale`. */
  const drawnBox = (id: PieceId, scale = 1) => boxAround(cellSquares({ ...game().pieces[id], scale }).flat())
  /** Let a piece go with its box's top-left at (x, y); the box round it once it has come to rest. */
  const letGo = (id: PieceId, x: number, y: number) => {
    game().release(id, { x, y })
    return drawnBox(id)
  }
  const spotOf = (id: PieceId) => game().pieces[id].spot as { x: number; y: number }
  const liesOn = (id: PieceId, words: Rect) =>
    parts(id).some((b) => b.left < words.right - 1e-6 && b.right > words.left + 1e-6 && b.top < words.bottom - 1e-6 && b.bottom > words.top + 1e-6)

  /** A window with more room than the mat on every side, by a different amount on each. */
  const windowOf = (mat: Rect): Rect => ({ left: mat.left - 3, top: mat.top - 2, right: mat.right + 1.5, bottom: mat.bottom + 0.5 })
  /** A line of words along the top of that window, starting near its left corner. */
  const wordsIn = (within: Rect): Rect => ({ left: within.left + 0.2, top: within.top + 0.1, right: within.left + 6.2, bottom: within.top + 0.6 })

  it('is the mat for as long as the table has not measured its window', () => {
    const { mat } = game().layout
    // Measured as the piece is drawn: it comes to rest at a slight angle, and its corners stay in too.
    expect(letGo('I4', 2, mat.top - 3).top).toBeCloseTo(mat.top, 6)
    expect(letGo('I4', mat.left - 4, 3).left).toBeCloseTo(mat.left, 6)
    expect(letGo('I4', mat.right + 4, 3).right).toBeCloseTo(mat.right, 6)
    expect(letGo('I4', 12, mat.bottom + 4).bottom).toBeCloseTo(mat.bottom, 6)
  })

  it('reaches as far as the window it is told of, and ends there on every side alike', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    game().setLayout(layout, { within, clear: [] })
    expect(letGo('L5', within.left - 5, 3).left).toBeCloseTo(within.left, 6)
    expect(letGo('L5', within.right + 5, 3).right).toBeCloseTo(within.right, 6)
    expect(letGo('L5', 12, within.top - 5).top).toBeCloseTo(within.top, 6)
    expect(letGo('L5', 12, within.bottom + 5).bottom).toBeCloseTo(within.bottom, 6)
  })

  it('measures a piece let go beside a phone tray at the small size it is drawn there', () => {
    const layout = tableLayout('tall', 'strip', 0.45)
    const within = windowOf(layout.mat)
    game().setLayout(layout, { within, clear: [] })
    // The bar lying flat, let go far out to either side, level with the tray under the board:
    // drawn at under half its size, it comes in only until what is drawn of it is inside.
    lay('I4', 0, 0)
    game().release('I4', { x: within.left - 6, y: layout.tray.top + 1 })
    expect(drawnBox('I4', 0.45).left).toBeCloseTo(within.left, 6)
    game().release('I4', { x: within.right + 6, y: layout.tray.top + 1 })
    expect(drawnBox('I4', 0.45).right).toBeCloseTo(within.right, 6)
    game().release('I4', { x: 2, y: within.bottom + 6 })
    expect(drawnBox('I4', 0.45).bottom).toBeCloseTo(within.bottom, 6)
  })

  it('leaves a piece let go inside it where it was let go', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    game().setLayout(layout, { within, clear: [] })
    // Beside the mat, where the table used to end.
    game().release('L5', { x: layout.mat.left - 2.5, y: 3 })
    expect(spotOf('L5')).toEqual({ kind: 'loose', x: layout.mat.left - 2.5, y: 3 })
  })

  it('keeps a piece let go on the words in the bar off them: sideways when that is the short way', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    const words = wordsIn(within)
    game().setLayout(layout, { within, clear: [words] })
    // The bar lying flat, its left end on the last of the words.
    lay('I4', 0, 0)
    const box = letGo('I4', words.right - 0.2, within.top + 0.3)
    expect(liesOn('I4', words)).toBe(false)
    expect(box.left).toBeCloseTo(words.right, 6)
    expect(spotOf('I4').y).toBeCloseTo(within.top + 0.3, 6)
  })

  it('keeps a piece let go on the words in the bar off them: down when that is the short way', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    const words = wordsIn(within)
    game().setLayout(layout, { within, clear: [words] })
    // The bar lying flat across the middle of the words.
    lay('I4', 0, 0)
    const box = letGo('I4', within.left + 1.5, within.top + 0.3)
    expect(liesOn('I4', words)).toBe(false)
    expect(box.top).toBeCloseTo(words.bottom, 6)
    expect(spotOf('I4').x).toBeCloseTo(within.left + 1.5, 6)
  })

  it('keeps a piece turned onto the words off them too', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    const words = wordsIn(within)
    game().setLayout(layout, { within, clear: [words] })
    // The bar standing just past the end of the words; turned about its top cell it swings over them.
    lay('I4', words.right + 0.1, within.top + 0.1, 1)
    expect(liesOn('I4', words)).toBe(false)
    game().turnPiece('I4', 1, { x: words.right + 0.6, y: within.top + 0.6 })
    expect(liesOn('I4', words)).toBe(false)
    expect(drawnBox('I4').top).toBeCloseTo(words.bottom, 6)
  })

  it('brings a piece back into view at once when the window leaves less room', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    game().setLayout(layout, { within, clear: [] })
    letGo('I4', within.right + 5, 3)
    game().setLayout(layout, { within: { ...within, right: within.right - 2 }, clear: [] })
    expect(drawnBox('I4').right).toBeCloseTo(within.right - 2, 6)
    expect(game().pieces.I4.motion).toEqual({ kind: 'jump' })
  })

  it('slides a piece out from under words in the bar that have grown over it', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    const words = wordsIn(within)
    game().setLayout(layout, { within, clear: [words] })
    // The bar standing just past the end of the words, and another piece well away from them.
    lay('I4', words.right + 0.1, within.top + 0.1, 1)
    lay('L5', 12, 4)
    const before = game().pieces
    // A button asking its question is wider for it: the words now reach under the bar.
    const longer = { ...words, right: words.right + 0.6 }
    game().setLayout(layout, { within: { ...within }, clear: [longer] })
    expect(liesOn('I4', longer)).toBe(false)
    expect(drawnBox('I4').left).toBeCloseTo(longer.right, 6)
    // It slides over, as the window itself has not changed; nothing else is touched.
    expect(game().pieces.I4.motion).toEqual({ kind: 'settle' })
    expect(game().pieces.L5).toBe(before.L5)
  })

  it('leaves the pieces be when the words in the bar get shorter again', () => {
    const layout = game().layout
    const within = windowOf(layout.mat)
    const words = wordsIn(within)
    game().setLayout(layout, { within, clear: [{ ...words, right: words.right + 0.6 }] })
    lay('I4', words.right + 0.7, within.top + 0.1, 1)
    const before = game().pieces
    game().setLayout(layout, { within: { ...within }, clear: [words] })
    expect(game().pieces).toBe(before)
  })
})

describe('opening the page', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts a fresh game, whatever an earlier visit left in the browser', async () => {
    // What the game used to save as it went: here a game under way that same day, one piece in the board.
    const pieces: Record<string, unknown> = Object.fromEntries(
      PIECE_IDS.map((id, i) => [id, { id, turns: 0, flips: 0, spot: { kind: 'loose', x: 10, y: i * 2 }, z: i, tilt: 1 }]),
    )
    pieces.I4 = { id: 'I4', turns: 1, flips: 0, spot: { kind: 'board', row: 2, col: 6 }, z: 9, tilt: 0 }
    const left = JSON.stringify({
      version: 1,
      pieces,
      layout: { mode: 'wide', arrangement: 'block', scale: 1 },
      target: { kind: 'today' },
      timerDay: '2026-11-25',
      sound: false,
      startedAt: 1000,
      finishedAt: null,
      usedAnswer: false,
    })
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 25, 21) })
    vi.stubGlobal('localStorage', { getItem: () => left, setItem: () => {} })
    vi.resetModules()
    const state: Store = (await import('./store')).useGame.getState()
    expectAllInTray(state)
    expect(state.startedAt).toBeNull()
  })

  it('keeps nothing in the browser as the game goes', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    vi.resetModules()
    const { useGame: opened } = await import('./store')
    vi.useFakeTimers()
    opened.getState().release('L4', { x: 2, y: 3 })
    expect(opened.getState().pieces.L4.spot.kind).toBe('board')
    vi.advanceTimersByTime(5000)
    expect(setItem).not.toHaveBeenCalled()
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
