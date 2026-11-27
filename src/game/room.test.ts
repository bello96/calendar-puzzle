import { describe, expect, it } from 'vitest'
import type { Rect } from './placement'
import { boxAround, intoRoom, type Room } from './room'

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom })

/** A window 20 wide and 10 high with nothing written in it. */
const open: Room = { within: rect(0, 0, 20, 10), clear: [] }
/** The same window with a line of words in its top-left corner, a little in from the edges. */
const worded: Room = { within: rect(0, 0, 20, 10), clear: [rect(0.5, 0.3, 4, 1.2)] }

/** The move, with the rounding of the sums taken out. */
const move = (parts: Rect[], room: Room) => {
  const by = intoRoom(parts, room)
  return { x: +by.x.toFixed(9) || 0, y: +by.y.toFixed(9) || 0 }
}

describe('boxAround', () => {
  it('is the upright box that just holds the points', () => {
    expect(
      boxAround([
        { x: 2, y: 5 },
        { x: -1, y: 3 },
        { x: 4, y: 3.5 },
      ]),
    ).toEqual(rect(-1, 3, 4, 5))
  })
})

describe('intoRoom', () => {
  it('leaves a piece that lies in the room where it is', () => {
    expect(move([rect(3, 3, 5, 4)], open)).toEqual({ x: 0, y: 0 })
    // Right up against the edge is still in.
    expect(move([rect(0, 9, 2, 10)], open)).toEqual({ x: 0, y: 0 })
  })

  it('brings a piece back from past any edge, as far as that edge and no further', () => {
    expect(move([rect(-3, 4, -1, 5)], open)).toEqual({ x: 3, y: 0 })
    expect(move([rect(21, 4, 23, 5)], open)).toEqual({ x: -3, y: 0 })
    expect(move([rect(4, -2.5, 6, -1.5)], open)).toEqual({ x: 0, y: 2.5 })
    expect(move([rect(4, 11, 6, 12)], open)).toEqual({ x: 0, y: -2 })
  })

  it('brings a piece back from past a corner along both edges', () => {
    expect(move([rect(19.5, 9.5, 21.5, 10.5)], open)).toEqual({ x: -1.5, y: -0.5 })
  })

  it('goes by whichever part of the piece sticks out furthest', () => {
    // An L lying past the left edge: its foot reaches further out than its upright.
    const upright = rect(-0.5, 2, 0.5, 4)
    const foot = rect(-1.5, 4, 0.5, 5)
    expect(move([upright, foot], open)).toEqual({ x: 1.5, y: 0 })
  })

  it('keeps the top-left corner of a piece in a window too small to hold it', () => {
    expect(move([rect(5, 5, 9, 6)], { within: rect(0, 0, 2, 2), clear: [] })).toEqual({ x: -5, y: -4 })
  })

  it('moves a piece off the words the short way: sideways if that is nearer', () => {
    // Its left end lies on the last of the words.
    expect(move([rect(3.8, 0.4, 5.8, 1.4)], worded)).toEqual({ x: 0.2, y: 0 })
  })

  it('moves a piece off the words the short way: down if that is nearer', () => {
    // Its top edge lies on the foot of the words, a long way from their end.
    expect(move([rect(1, 1, 3, 2)], worded)).toEqual({ x: 0, y: 0.2 })
  })

  it('does not count a piece that only touches the words as lying on them', () => {
    expect(move([rect(4, 0.4, 6, 1.4)], worded)).toEqual({ x: 0, y: 0 })
    expect(move([rect(1, 1.2, 3, 2.2)], worded)).toEqual({ x: 0, y: 0 })
  })

  it('never takes a piece out of the window to get it off the words', () => {
    // Left or up would be nearest, but there the window ends: it goes down.
    expect(move([rect(0.1, 0.1, 0.7, 1.1)], worded)).toEqual({ x: 0, y: 1.1 })
  })

  it('first brings the piece into the window, then off the words', () => {
    // Let go above the top edge, over the words: back in it would lie on them, so on down past them.
    expect(move([rect(1, -3, 3, -2)], worded)).toEqual({ x: 0, y: 4.2 })
  })

  it('looks at the parts of the piece, not the box around them', () => {
    // A U with the words in its crook: they are inside its box, but under none of it.
    const words = rect(4.2, 0, 5.8, 2.5)
    const u = [rect(3, 0, 4, 3), rect(6, 0, 7, 3), rect(3, 3, 7, 4)]
    expect(move(u, { within: open.within, clear: [words] })).toEqual({ x: 0, y: 0 })
  })

  it('moves the whole piece when any part of it lies on the words', () => {
    // The same U a little to the right: now its left arm is on them, and left is the short way off.
    const words = rect(4.2, 0, 5.8, 2.5)
    const u = [rect(3.5, 0, 4.5, 3), rect(6.5, 0, 7.5, 3), rect(3.5, 3, 7.5, 4)]
    expect(move(u, { within: open.within, clear: [words] })).toEqual({ x: -0.3, y: 0 })
  })

  it('does not move a piece off one lot of words onto another', () => {
    // Two lots with a gap between them narrower than the piece: it goes down, clear of both.
    const room: Room = { within: open.within, clear: [rect(0, 0, 4, 1), rect(6, 0, 10, 1)] }
    expect(move([rect(3, 0.2, 6, 1.2)], room)).toEqual({ x: 0, y: 0.8 })
  })

  it('goes on past a second lot of words when the gap before them is too narrow', () => {
    // Both lots are tall, so sideways is the short way: past the first, and past the second too.
    const room: Room = { within: open.within, clear: [rect(0, 0, 4, 3), rect(4.5, 0, 6, 3)] }
    expect(move([rect(3.5, 0.2, 4.5, 0.8)], room)).toEqual({ x: 2.5, y: 0 })
  })

  it('goes below both when words lie one line under another', () => {
    const room: Room = { within: open.within, clear: [rect(0, 0, 4, 1), rect(0, 1.1, 4, 2)] }
    expect(move([rect(1, 0.5, 2, 1.5)], room)).toEqual({ x: 0, y: 1.5 })
  })

  it('leaves the piece in the window when no way out of the words stays in it', () => {
    const room: Room = { within: rect(0, 0, 4, 2), clear: [rect(0, 0, 4, 1.5)] }
    expect(move([rect(1, 0, 2, 1)], room)).toEqual({ x: 0, y: 0 })
  })
})
