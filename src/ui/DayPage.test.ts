import { describe, expect, it } from 'vitest'
import { almanacFor, lunarDay, lunarOf } from './DayPage'

describe('the lunar date on the page', () => {
  it('names the days of the month as a calendar prints them', () => {
    expect([1, 10, 11, 19, 20, 21, 29, 30].map(lunarDay)).toEqual(['初一', '初十', '十一', '十九', '二十', '廿一', '廿九', '三十'])
  })

  it('is read from the lunar calendar, leap months and the twelfth month included', () => {
    expect(lunarOf(new Date(2026, 10, 27))).toBe('十月十九')
    expect(lunarOf(new Date(2026, 1, 17))).toBe('正月初一')
    expect(lunarOf(new Date(2025, 6, 25))).toBe('闰六月初一')
    expect(lunarOf(new Date(2027, 0, 20))).toBe('腊月十三')
  })
})

describe("the day's 宜 and 忌", () => {
  it('is the same from just after midnight to just before the next', () => {
    expect(almanacFor(new Date(2026, 10, 27, 0, 0, 1))).toEqual(almanacFor(new Date(2026, 10, 27, 23, 59, 59)))
  })

  it('always recommends 拼图 first, then two more, and warns against two, none of them twice', () => {
    const day = new Date(2027, 0, 1)
    for (let i = 0; i < 400; i++) {
      const { good, bad } = almanacFor(day)
      expect(good[0]).toBe('拼图')
      expect(good).toHaveLength(3)
      expect(bad).toHaveLength(2)
      expect(new Set([...good, ...bad]).size, day.toDateString()).toBe(5)
      day.setDate(day.getDate() + 1)
    }
  })

  it('never says the same as the day before, nor warns against the same', () => {
    // Two years on end, so across the ends of months and years and a 29 February.
    const day = new Date(2027, 0, 1)
    let last = almanacFor(day)
    for (let i = 0; i < 730; i++) {
      day.setDate(day.getDate() + 1)
      const next = almanacFor(day)
      expect(next.good.join(), day.toDateString()).not.toBe(last.good.join())
      expect(next.bad.join(), day.toDateString()).not.toBe(last.bad.join())
      last = next
    }
  })

  it('goes through every pair of recommendations before any comes round again', () => {
    const day = new Date(2026, 0, 1)
    const seen = new Set<string>()
    for (;;) {
      const pair = almanacFor(day).good.slice(1).join()
      if (seen.has(pair)) break
      seen.add(pair)
      day.setDate(day.getDate() + 1)
    }
    const n = new Set([...seen].flatMap((p) => p.split(','))).size
    expect(seen.size).toBe((n * (n - 1)) / 2)
  })
})
