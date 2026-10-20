import { describe, expect, it } from 'vitest'
import { mirrorH, orient, orientations, rotateCW, rotatePoint, mirrorPoint } from './geometry'
import type { Cell } from './geometry'

// Shapes drawn as text so the expected values are easy to check by eye.
function shape(rows: string[]): Cell[] {
  const cells: Cell[] = []
  rows.forEach((line, r) => [...line].forEach((ch, c) => ch === 'X' && cells.push([r, c])))
  return cells
}

const L4 = shape(['X..', 'XXX'])

describe('rotateCW', () => {
  it('turns a shape a quarter turn clockwise as seen on screen', () => {
    expect(rotateCW(L4)).toEqual(shape(['XX', 'X.', 'X.']))
  })
})

describe('mirrorH', () => {
  it('mirrors left-to-right', () => {
    expect(mirrorH(shape(['.XX', 'XX.']))).toEqual(shape(['XX.', '.XX']))
  })
})

describe('orient', () => {
  it('rotates by the given number of quarter turns', () => {
    expect(orient(L4, 2, false)).toEqual(shape(['XXX', '..X']))
  })

  it('rotates first, then mirrors', () => {
    expect(orient(L4, 1, true)).toEqual(shape(['XX', '.X', '.X']))
  })

  it('treats negative turns as counter-clockwise', () => {
    expect(orient(L4, -1, false)).toEqual(shape(['.X', '.X', 'XX']))
  })
})

describe('orientations', () => {
  it.each([
    ['I tetromino', ['XXXX'], 2],
    ['S tetromino', ['.XX', 'XX.'], 4],
    ['L tetromino', ['X..', 'XXX'], 8],
    ['T pentomino', ['XXX', '.X.', '.X.'], 4],
    ['U pentomino', ['X.X', 'XXX'], 4],
    ['N pentomino', ['.XXX', 'XX..'], 8],
  ])('finds every distinct placement shape of the %s', (_, rows, count) => {
    expect(orientations(shape(rows))).toHaveLength(count)
  })

  it('reports the rotation and flip that produce each shape', () => {
    for (const o of orientations(L4)) expect(orient(L4, o.rot, o.flip)).toEqual(o.cells)
  })
})

describe('rotatePoint', () => {
  it('turns clockwise on screen (y grows downward)', () => {
    expect(rotatePoint({ x: 3, y: 1 }, { x: 1, y: 1 }, 1)).toEqual({ x: 1, y: 3 })
  })

  it('turns counter-clockwise with direction -1', () => {
    expect(rotatePoint({ x: 3, y: 1 }, { x: 1, y: 1 }, -1)).toEqual({ x: 1, y: -1 })
  })
})

describe('mirrorPoint', () => {
  it('reflects across the vertical line through the pivot', () => {
    expect(mirrorPoint({ x: 3, y: 1 }, 1)).toEqual({ x: -1, y: 1 })
  })
})
