import { describe, expect, it } from 'vitest'
import type { Cell } from './geometry'
import { outlinePolygon } from './outline'

const L4: Cell[] = [[0, 0], [1, 0], [1, 1], [1, 2]] // X.. / XXX

describe('outlinePolygon', () => {
  it('traces the corners clockwise from the top-left', () => {
    expect(outlinePolygon(L4)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
    ])
  })

  it('pulls every edge inward by the inset, including inner corners', () => {
    const points = outlinePolygon(L4, 0.1).map(({ x, y }) => ({ x: +x.toFixed(6), y: +y.toFixed(6) }))
    expect(points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 1.1 },
      { x: 2.9, y: 1.1 },
      { x: 2.9, y: 1.9 },
      { x: 0.1, y: 1.9 },
    ])
  })

  it('merges straight runs into single edges', () => {
    expect(outlinePolygon([[0, 0], [0, 1], [0, 2], [0, 3]])).toHaveLength(4)
  })
})
