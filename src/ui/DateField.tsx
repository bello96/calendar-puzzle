// Only the date picker (with what it needs itself) is taken from antd, each part by its own
// path, so the rest of the library stays out of the bundle.
import ConfigProvider, { type ThemeConfig } from 'antd/es/config-provider'
import DatePicker from 'antd/es/date-picker'
import zhCN from 'antd/es/date-picker/locale/zh_CN'
import theme from 'antd/es/theme'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState, type ComponentProps, type ComponentRef } from 'react'
import { dateParts, formatDate } from './table-context'

// Colours of the mat from index.css, as values: antd works out its own shades from them.
const CHALK = '#eef1e6'
const MAT_DEEP = '#214739'
const chalk = (alpha: number) => `rgb(238 241 230 / ${alpha})`

/** The calendar in the mat's colours, like the other pop-ups: chalk on deep green, the chosen day filled in chalk. */
const MAT_THEME: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: CHALK,
    colorBgBase: MAT_DEEP,
    colorTextBase: CHALK,
    colorBgElevated: MAT_DEEP,
    colorText: CHALK,
    colorTextHeading: CHALK,
    colorTextDisabled: chalk(0.3),
    colorTextLightSolid: MAT_DEEP,
    colorIcon: chalk(0.6),
    colorIconHover: CHALK,
    colorLink: CHALK,
    colorLinkHover: '#fff',
    colorLinkActive: chalk(0.8),
    colorSplit: chalk(0.1),
    fontFamily: 'var(--font-sans)',
    borderRadius: 6,
    borderRadiusSM: 6,
    borderRadiusLG: 10,
    boxShadowSecondary: `0 0 0 1px ${chalk(0.08)}, 0 16px 36px -8px rgb(8 26 19 / 0.6), 0 4px 12px rgb(8 26 19 / 0.3)`,
  },
  components: {
    DatePicker: {
      cellHoverBg: chalk(0.1),
      cellWidth: 38,
      cellHeight: 28,
      // The keyboard ring, as on the toolbar buttons.
      activeBorderColor: CHALK,
      lineWidthFocus: 2,
      // Above the pieces, the result panel and the hint toast.
      zIndexPopup: 2100,
    },
  },
}

/** "2026年10月20日 星期二": the year, then the three cells the board leaves open. */
const fullDate = (d: Dayjs) => `${d.year()}年${formatDate(dateParts(d.toDate()))}`

/**
 * Keys that move the chosen day while the calendar is open (the panel has no
 * keyboard of its own): a day, a week, a month, or with Shift a year.
 */
const STEPS: Record<string, (d: Dayjs, shift: boolean) => Dayjs> = {
  ArrowLeft: (d) => d.subtract(1, 'day'),
  ArrowRight: (d) => d.add(1, 'day'),
  ArrowUp: (d) => d.subtract(1, 'week'),
  ArrowDown: (d) => d.add(1, 'week'),
  PageUp: (d, shift) => d.subtract(1, shift ? 'year' : 'month'),
  PageDown: (d, shift) => d.add(1, shift ? 'year' : 'month'),
}

/**
 * The picker's text field, drawn as the year in small print and then the date
 * in bold. The picker's own input lies on top, transparent, so it still gets
 * the focus, keys and clicks. Drawing the text apart also sizes the field to
 * it: the stock one counts characters, which cuts Chinese text off.
 */
function DateText({ value, ...input }: ComponentProps<'input'>) {
  const text = String(value ?? '')
  const year = text.slice(0, text.indexOf('年') + 1)
  return (
    <span className="relative whitespace-nowrap">
      <span aria-hidden>
        <span className="mr-1 text-[15px] text-chalk-dim">{year}</span>
        <span className="text-[19px] leading-tight font-bold tracking-wide tabular-nums sm:text-[22px]">
          {text.slice(year.length)}
        </span>
      </span>
      <input
        {...input}
        value={value}
        title="选一个日期"
        className="absolute inset-0 h-full w-full cursor-pointer bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </span>
  )
}

const COMPONENTS = { input: DateText }
// Lit like a toolbar button on hover, and held lit while the calendar is open. The open
// calendar is focus enough, so the keyboard ring (antd's outline) only shows while it is shut.
const CLASS_NAMES = { root: 'hover:bg-chalk/10!' }
const OPEN_CLASS_NAMES = { root: 'bg-chalk/10! outline-none!' }
const STYLES = {
  root: { padding: '4px 6px' },
  suffix: { color: 'var(--color-chalk-dim)', marginInlineStart: 6 },
}

/** The date to make, as the title of the page; click it to pick another day from a calendar. */
export function DateField({ date, onChange }: { date: Date; onChange: (date: Date) => void }) {
  const value = useMemo(() => dayjs(date), [date])
  const reduced = useReducedMotion() ?? false
  const look = useMemo(() => (reduced ? { ...MAT_THEME, token: { ...MAT_THEME.token, motion: false } } : MAT_THEME), [reduced])
  const picker = useRef<ComponentRef<typeof DatePicker>>(null)
  const [open, setOpen] = useState(false)
  /** Was the calendar opened with a mouse or a finger, rather than the keyboard? */
  const byPointer = useRef(false)
  return (
    <ConfigProvider theme={look}>
      <DatePicker
        ref={picker}
        open={open}
        onMouseDown={() => (byPointer.current = true)}
        onBlur={() => (byPointer.current = false)}
        onOpenChange={(next) => {
          setOpen(next)
          // Done with the mouse: let go of the focus, so its keyboard ring is not left around the date.
          if (!next && byPointer.current) picker.current?.blur()
        }}
        onKeyDown={(e) => {
          if (!open) return
          const step = STEPS[e.key]
          if (step) {
            e.preventDefault()
            onChange(step(value, e.shiftKey).toDate())
          } else if (e.key === 'Enter') {
            e.preventDefault()
            setOpen(false)
          }
        }}
        value={value}
        onChange={(d) => d && onChange(d.toDate())}
        format={fullDate}
        locale={zhCN}
        variant="borderless"
        allowClear={false}
        inputReadOnly
        placement="bottomLeft"
        aria-label="要拼的日期"
        components={COMPONENTS}
        suffixIcon={<CalendarIcon />}
        classNames={open ? OPEN_CLASS_NAMES : CLASS_NAMES}
        styles={STYLES}
      />
    </ConfigProvider>
  )
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4m8-4v4" />
    </svg>
  )
}
