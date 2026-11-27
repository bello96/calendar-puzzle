import { useMemo, type ReactNode } from 'react'
import { WEEKDAYS } from './table-context'

/*
 * What a finished day earns: the day's page of a calendar, cut from the same
 * basswood as the board and engraved the same way, with the 宜 and 忌 an
 * almanac prints for the day, and stamped as done in red ink.
 */

/** What the almanac recommends. Today's always begins with 拼图; two more of these follow it. */
const GOOD = [
  '晒太阳',
  '喝热茶',
  '早点睡',
  '夸自己',
  '发个呆',
  '伸懒腰',
  '散散步',
  '吃点甜的',
  '听首老歌',
  '看看云',
  '去炫耀',
  '多喝水',
  '早下班',
  '打个盹',
  '吃顿好的',
  '约朋友',
  '深呼吸',
  '笑一笑',
]

/** What it warns against. */
const BAD = ['熬夜', '拆了重拼', '偷看答案', '想太多', '久坐', '叹气', '内耗', '生闷气', '拖延', '皱眉头', '钻牛角尖', '较劲', '急躁', '刷手机']

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/**
 * Two of `pool` for day `day`. Day after day it steps through every pair once before any comes
 * round again, by a stride that shares no factor with the number of pairs, so two days running
 * never get the same two.
 */
function pairFor(pool: readonly string[], day: number): [string, string] {
  const n = pool.length
  const pairs = (n * (n - 1)) / 2
  let stride = Math.floor(pairs * 0.381)
  while (gcd(stride, pairs) !== 1) stride++
  let k = (((day * stride) % pairs) + pairs) % pairs
  for (let i = 0; i < n; i++) {
    const after = n - 1 - i
    if (k < after) return [pool[i], pool[i + 1 + k]]
    k -= after
  }
  throw new Error('unreachable')
}

/** Days since 1970-01-01 of the calendar day `date` falls on, wherever the clock is. */
const dayNumber = (date: Date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)

/** The day's 宜 and 忌: the same all that day, another the next. */
export function almanacFor(date: Date): { good: string[]; bad: string[] } {
  const day = dayNumber(date)
  return { good: ['拼图', ...pairFor(GOOD, day)], bad: pairFor(BAD, day + 3) }
}

const DIGITS = '一二三四五六七八九十'

/** A day of the lunar month as a calendar prints it: 初一 to 初十, 十一 to 十九, 二十, 廿一 to 廿九, 三十. */
export function lunarDay(n: number): string {
  if (n <= 10) return `初${DIGITS[n - 1]}`
  if (n < 20) return `十${DIGITS[n - 11]}`
  if (n === 20) return '二十'
  if (n < 30) return `廿${DIGITS[n - 21]}`
  return '三十'
}

/** The lunar date, as 十月十九 or 闰六月初一; null where the browser has no lunar calendar to ask. */
export function lunarOf(date: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).formatToParts(date)
    const month = parts.find((p) => p.type === 'month')?.value ?? ''
    const day = Number(parts.find((p) => p.type === 'day')?.value)
    // A browser without the lunar calendar answers in the ordinary one: 11月 rather than 十月.
    if (!/^闰?(正|[一二三四五六七八九十]+|冬|腊)月$/.test(month) || !Number.isInteger(day) || day < 1 || day > 30) return null
    return month + lunarDay(day)
  } catch {
    return null
  }
}

/*
 * The plaque, in units of about a board cell, so that the board's own grain filter draws its
 * wood at the board's scale.
 */
const W = 3.6
const H = 4.9
/** Room round it for its shadow on the mat. */
const VIEW = `-0.16 -0.12 ${W + 0.32} ${H + 0.44}`

/** Lettering burnt into the wood, with the faint lit edge below each cut that the board's lettering has. */
function Cut({
  x,
  y,
  size,
  weight = 700,
  anchor = 'middle',
  children,
}: {
  x: number
  y: number
  size: number
  weight?: number
  anchor?: 'start' | 'middle'
  children: ReactNode
}) {
  const common = { x, fontSize: size, fontWeight: weight, textAnchor: anchor, dominantBaseline: 'central' as const }
  return (
    <>
      <text {...common} y={y + Math.min(0.014 + size * 0.01, 0.03)} fill="#fff6e4" fillOpacity={0.55}>
        {children}
      </text>
      <text {...common} y={y} fill="var(--color-burn)" fillOpacity={0.9}>
        {children}
      </text>
    </>
  )
}

/** One line of the almanac: its mark in a disc, then what it says. */
function Luck({ y, mark, disc, words }: { y: number; mark: string; disc: string; words: string[] }) {
  return (
    <>
      <circle cx={0.52} cy={y} r={0.16} fill={disc} />
      <text x={0.52} y={y} fontSize={0.19} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="var(--color-wood)">
        {mark}
      </text>
      <Cut x={0.82} y={y} size={0.2} weight={500} anchor="start">
        {words.join('　')}
      </Cut>
    </>
  )
}

export function DayPage({ date }: { date: Date }) {
  const lunar = useMemo(() => lunarOf(date), [date])
  const { good, bad } = useMemo(() => almanacFor(date), [date])
  const weekday = `星期${WEEKDAYS[date.getDay()]}`
  const label = `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}${lunar ? `，农历${lunar}` : ''}。宜：${good.join('、')}；忌：${bad.join('、')}。今日已拼`
  return (
    <div className="day-page">
      <svg viewBox={VIEW} role="img" aria-label={label} style={{ fontFamily: 'var(--font-sans)' }}>
        {/* Lying on the mat as the board does: its shadow, its edge, its face. */}
        <rect width={W} height={H} rx={0.2} transform="translate(0.04 0.18)" fill="rgb(8 22 17 / 0.5)" filter="url(#board-shadow)" />
        <rect width={W} height={H} rx={0.2} transform="translate(0 0.08)" fill="var(--color-wood-side)" />
        <rect width={W} height={H} rx={0.2} fill="var(--color-wood)" />
        <rect width={W} height={H} rx={0.2} fill="#fff" fillOpacity={0.85} filter="url(#grain-board)" />
        <rect width={W} height={H} rx={0.2} fill="none" stroke="#8a6537" strokeWidth={0.02} strokeOpacity={0.6} />

        {/* The year and month, left standing in a band burnt dark. */}
        <rect x={0.22} y={0.22} width={W - 0.44} height={0.52} rx={0.07} fill="var(--color-burn)" fillOpacity={0.86} />
        <text
          x={W / 2}
          y={0.485}
          fontSize={0.25}
          fontWeight={700}
          letterSpacing={0.04}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-wood)"
        >
          {date.getFullYear()}年{date.getMonth() + 1}月
        </text>

        <Cut x={W / 2 - 0.02} y={1.62} size={1.62}>
          <tspan fontFamily="'Bodoni 72', Didot, 'Times New Roman', 'Noto Serif', serif" letterSpacing={-0.05}>
            {date.getDate()}
          </tspan>
        </Cut>

        <Cut x={W / 2} y={2.72} size={0.22}>
          <tspan>{weekday}</tspan>
          {lunar && (
            <tspan dx={0.24} fontSize={0.2} fontWeight={500} fillOpacity={0.75}>
              农历{lunar}
            </tspan>
          )}
        </Cut>

        {/* A score line across, then the almanac. */}
        <path d={`M0.32 3.62H${W - 0.32}`} stroke="var(--color-burn)" strokeOpacity={0.4} strokeWidth={0.014} strokeDasharray="0.06 0.045" />
        <Luck y={4.0} mark="宜" disc="var(--color-ink)" words={good} />
        <Luck y={4.46} mark="忌" disc="var(--color-burn)" words={bad} />

        <g transform={`translate(${W - 0.74} 3.32) rotate(-11)`}>
          <Seal />
        </g>
      </svg>
    </div>
  )
}

/**
 * A square seal in red ink, 今日已拼, the characters left as bare wood, centred where it is put.
 * The ink is worn in places and its edge is not quite straight, as a real stamp's is.
 */
function Seal() {
  const glyph = { fontSize: 36, fontWeight: 700, textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
  return (
    <g className="seal">
      <g transform="scale(0.009) translate(-50 -50)">
        <defs>
          <filter id="seal-wear" x="-6%" y="-6%" width="112%" height="112%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="grain" />
            <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.4" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="9" result="patch" />
            <feColorMatrix in="patch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -12 0 0 0 8.8" result="ink" />
            <feComposite in="rough" in2="ink" operator="in" />
          </filter>
          <mask id="seal-cut">
            <rect width="100" height="100" fill="#fff" />
            <g fill="#000" stroke="#000" strokeWidth={2.2} strokeLinejoin="round" fontFamily="var(--font-hand)">
              <text x="30" y="30" {...glyph}>
                今
              </text>
              <text x="70" y="30" {...glyph}>
                日
              </text>
              <text x="30" y="70" {...glyph}>
                已
              </text>
              <text x="70" y="70" {...glyph}>
                拼
              </text>
            </g>
          </mask>
        </defs>
        <g filter="url(#seal-wear)">
          <rect x="4" y="4" width="92" height="92" rx="6" fill="var(--color-ink)" mask="url(#seal-cut)" />
        </g>
      </g>
    </g>
  )
}
