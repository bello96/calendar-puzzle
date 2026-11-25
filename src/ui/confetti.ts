/*
 * Party poppers over the whole window when the day is made: paper shot up from
 * the two bottom corners, a few bursts in the air after them, and then all of
 * it fluttering down. It is drawn on a canvas laid over the page for those few
 * seconds and taken away again, so the page needs no library or pictures for it.
 */

/** Paper colours that show on the green mat and on the wood alike, each with the shade of its other side. */
const PAPERS = ['#e8453c', '#f58a3a', '#f7cf47', '#f78fb3', '#5bc0eb', '#9b7ede', '#f4f1e4', '#7fdcb2'].map(
  (front): [front: string, back: string] => [front, shaded(front, 0.74)],
)

function shaded(hex: string, by: number): string {
  const part = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * by)
  return `rgb(${part(1)} ${part(3)} ${part(5)})`
}

/** One scrap of paper. Lengths are in px, times in seconds, angles in radians. */
interface Bit {
  /** When it is fired, on the show's clock. */
  born: number
  /** How long it is there for; it fades out at the end of that. */
  life: number
  x: number
  y: number
  vx: number
  vy: number
  /** How hard the air brakes it, per second. Paper is light: it stops short, then drifts down. */
  drag: number
  /** Its turn in the plane of the screen. */
  spin: number
  spinRate: number
  /** Its tumble end over end: seen as the paper narrowing to a line and showing its other side. */
  roll: number
  rollRate: number
  /** Its sway from side to side, as px a second at the widest. */
  sway: number
  swayRate: number
  swayReach: number
  w: number
  h: number
  round: boolean
  paper: [front: string, back: string]
}

/** How fast paper falls is its weight against the air: px/s² at full size. */
const WEIGHT = 520
/** The last of its time is spent fading. */
const FADE = 0.9

const between = (a: number, b: number) => a + (b - a) * Math.random()
const pick = <T>(of: readonly T[]) => of[Math.floor(Math.random() * of.length)]

interface Show {
  canvas: HTMLCanvasElement
  pen: CanvasRenderingContext2D
  bits: Bit[]
  clock: number
  /** The canvas in CSS px, and how many of its own px go to one of those. */
  width: number
  height: number
  density: number
}

let show: Show | null = null

function begin(): Show | null {
  const canvas = document.createElement('canvas')
  const pen = canvas.getContext('2d')
  if (!pen) return null
  canvas.setAttribute('aria-hidden', 'true')
  // Over the table and all that lies on it, under the guide; clicks go straight through.
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2500'
  document.body.append(canvas)

  const s: Show = { canvas, pen, bits: [], clock: 0, width: 0, height: 0, density: 1 }
  const fit = () => {
    s.width = canvas.clientWidth
    s.height = canvas.clientHeight
    s.density = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(s.width * s.density)
    canvas.height = Math.round(s.height * s.density)
  }
  fit()
  window.addEventListener('resize', fit)

  let last = performance.now()
  requestAnimationFrame(function frame(now) {
    // A tab left and come back to picks up where it was, rather than jumping ahead.
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    s.clock += dt
    s.bits = s.bits.filter((bit) => s.clock < bit.born + bit.life)
    draw(s, dt)
    if (s.bits.length) requestAnimationFrame(frame)
    else {
      // The last scrap has gone: take the canvas away again.
      window.removeEventListener('resize', fit)
      canvas.remove()
      if (show === s) show = null
    }
  })
  return s
}

/** Move every scrap on by `dt` and draw it. */
function draw(s: Show, dt: number) {
  const { pen, density: k } = s
  pen.setTransform(1, 0, 0, 1, 0, 0)
  pen.clearRect(0, 0, s.canvas.width, s.canvas.height)
  const size = scaleFor(s)
  for (const bit of s.bits) {
    const age = s.clock - bit.born
    if (age < 0) continue
    const slowed = Math.exp(-bit.drag * dt)
    bit.vx *= slowed
    bit.vy = bit.vy * slowed + WEIGHT * size * dt
    bit.sway += bit.swayRate * dt
    bit.x += (bit.vx + Math.cos(bit.sway) * bit.swayReach) * dt
    bit.y += bit.vy * dt
    bit.spin += bit.spinRate * dt
    bit.roll += bit.rollRate * dt

    const facing = Math.cos(bit.roll)
    // Edge on, a sliver of it still shows.
    const narrow = Math.max(Math.abs(facing), 0.14)
    const cos = Math.cos(bit.spin) * k
    const sin = Math.sin(bit.spin) * k
    pen.setTransform(cos, sin, -sin * narrow, cos * narrow, bit.x * k, bit.y * k)
    pen.globalAlpha = Math.min(1, (bit.life - age) / FADE)
    pen.fillStyle = bit.paper[facing >= 0 ? 0 : 1]
    if (bit.round) {
      pen.beginPath()
      pen.arc(0, 0, bit.w / 2, 0, Math.PI * 2)
      pen.fill()
    } else pen.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h)
  }
}

/** Scraps are cut to suit the window: smaller on a phone than on a desktop screen. */
const scaleFor = (s: Show) => Math.min(Math.max(Math.min(s.width, s.height) / 800, 0.75), 1.35)

/**
 * A scrap fired at `born` from (x, y), heading `angle` (0 to the right, a quarter turn straight up)
 * and going about `reach` px before the air has stopped it.
 */
function scrap(s: Show, born: number, x: number, y: number, angle: number, reach: number, papers = PAPERS): Bit {
  const size = scaleFor(s)
  const kind = Math.random()
  // Mostly small sheets, with some ribbons and some round dots among them.
  const [w, h] = kind < 0.6 ? [between(8, 13), between(5, 9)] : kind < 0.8 ? [between(3, 4.5), between(15, 24)] : [between(6, 9), 0]
  const drag = between(2.6, 3.8)
  const speed = reach * drag
  return {
    born,
    life: between(3.4, 5),
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: -Math.sin(angle) * speed,
    drag,
    spin: between(0, Math.PI * 2),
    spinRate: between(-6, 6),
    roll: between(0, Math.PI * 2),
    rollRate: between(5, 13) * (Math.random() < 0.5 ? -1 : 1),
    sway: between(0, Math.PI * 2),
    swayRate: between(2.2, 4.4),
    swayReach: between(30, 95) * size,
    w: w * size,
    h: h * size,
    round: h === 0,
    paper: pick(papers),
  }
}

/** A popper in a bottom corner (`side` -1 the left, 1 the right) goes off: a fan of paper up and over the middle. */
function pop(s: Show, at: number, side: -1 | 1, count: number, far: number) {
  const from = { x: side < 0 ? -10 : s.width + 10, y: s.height + 10 }
  // Aimed high over the nearer third of the window.
  const aim = { x: s.width * (side < 0 ? 0.36 : 0.64), y: s.height * 0.08 }
  const up = Math.atan2(from.y - aim.y, aim.x - from.x)
  const distance = Math.hypot(aim.x - from.x, aim.y - from.y) * far
  for (let i = 0; i < count; i++) {
    // Thickest along the aim, thinning to either side of it.
    const off = (Math.random() + Math.random() - 1) * 0.5
    s.bits.push(scrap(s, at + between(0, 0.07), from.x, from.y, up + off, distance * between(0.35, 1.3)))
  }
}

/** A burst in the air around (x, y): a puff of paper in a colour or two of its own. */
function burst(s: Show, at: number, x: number, y: number, count: number, radius: number) {
  const papers = [pick(PAPERS), pick(PAPERS)]
  for (let i = 0; i < count; i++) {
    s.bits.push(scrap(s, at, x, y, between(0, Math.PI * 2), radius * between(0.25, 1), papers))
  }
}

/** Set the poppers off. Does nothing for someone who has asked their system for less motion. */
export function celebrate(): void {
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  show ??= begin()
  const s = show
  if (!s) return

  // As much paper as suits the window: a phone gets about half of what a desktop screen does.
  const much = Math.min(Math.max(Math.sqrt((s.width * s.height) / (1440 * 900)), 0.45), 1.25)
  const some = (n: number) => Math.round(n * much)
  const now = s.clock
  for (const side of [-1, 1] as const) {
    pop(s, now, side, some(130), 1)
    pop(s, now + 0.28, side, some(90), 0.8)
  }
  // Then bursts overhead, one after another, spread across the width in no set order.
  const places = [0.2, 0.5, 0.8, 0.35, 0.65].sort(() => Math.random() - 0.5).slice(0, s.width > 700 ? 5 : 3)
  places.forEach((place, i) => {
    const x = s.width * (place + between(-0.06, 0.06))
    const y = s.height * between(0.14, 0.4)
    burst(s, now + 0.55 + i * 0.34 + between(0, 0.1), x, y, some(60), Math.min(s.width, s.height) * between(0.2, 0.32))
  })
}
