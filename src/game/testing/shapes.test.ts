import { describe, expect, it } from 'vitest'
import type { Cell } from '../geometry'
import { canonical } from './shapes'

function shape(rows: string[]): Cell[] {
  const cells: Cell[] = []
  rows.forEach((line, r) => [...line].forEach((ch, c) => ch === 'X' && cells.push([r, c])))
  return cells
}

describe('canonical', () => {
  it('is the same for a shape and its mirror image', () => {
    expect(canonical(shape(['.XXX', 'XX..']))).toBe(canonical(shape(['X.', 'X.', 'XX', '.X'])))
  })

  it('differs between different shapes', () => {
    expect(canonical(shape(['X..', 'XXX']))).not.toBe(canonical(shape(['.X.', 'XXX'])))
  })
})
