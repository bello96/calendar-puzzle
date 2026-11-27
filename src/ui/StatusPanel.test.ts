import { describe, expect, it } from 'vitest'
import { duration, timeQuip } from './StatusPanel'

const s = 1000
const min = 60 * s
/** The quip as it reads, without the marks for where it may break. */
const said = (ms: number) => timeQuip(ms).replaceAll('|', '')

describe('the time taken', () => {
  it('is said in seconds, then minutes and seconds, then hours and minutes', () => {
    expect(duration(400)).toBe('1秒')
    expect(duration(59.4 * s)).toBe('59秒')
    expect(duration(118 * s)).toBe('1分58秒')
    expect(duration(75 * min + 20 * s)).toBe('1小时15分')
  })

  it('is likened to something that takes about as long', () => {
    expect(said(40 * s)).toBe('比热杯牛奶还快')
    expect(said(1 * min)).toBe('比泡一碗面还快')
    expect(said(2 * min + 59 * s)).toBe('比泡一碗面还快')
    expect(said(3 * min)).toBe('一首歌的工夫')
    expect(said(12 * min)).toBe('一集动画的工夫')
    expect(said(5 * 60 * min)).toBe('慢工出细活，坚持到底')
  })

  it('may break into pieces of at most six characters, to fit beside the page on a small screen', () => {
    for (let m = 0; m < 200; m += 0.5) {
      for (const piece of timeQuip(m * min).split(/(?<=，)|\|/)) expect(piece.length, piece).toBeLessThanOrEqual(6)
    }
  })
})
