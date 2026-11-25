import { describe, expect, it } from 'vitest'
import { cheerFor } from './StatusPanel'

describe('the cheer for a finished day', () => {
  it('is the same from just after midnight to just before the next', () => {
    expect(cheerFor(new Date(2026, 10, 25, 0, 0, 1))).toBe(cheerFor(new Date(2026, 10, 25, 23, 59, 59)))
  })

  it('is never the one from the day before', () => {
    // Two years on end, so across the ends of months and years and a 29 February.
    const day = new Date(2027, 0, 1)
    let last = cheerFor(day)
    for (let i = 0; i < 730; i++) {
      day.setDate(day.getDate() + 1)
      const cheer = cheerFor(day)
      expect(cheer, day.toDateString()).not.toBe(last)
      last = cheer
    }
  })
})
