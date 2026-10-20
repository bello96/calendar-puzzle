import { PIECE_BY_ID, PIECE_IDS, type PieceId } from '../game/pieces'

/** Every third piece is cut with its grain running top to bottom; the rest run left to right. */
const grainDown = (id: PieceId) => PIECE_IDS.indexOf(id) % 3 === 1

/**
 * Shared SVG filters. Units are cells (every board and piece SVG uses a
 * viewBox measured in cells), so the grain has the same scale everywhere.
 */
export function WoodDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {PIECE_IDS.map((id, i) => (
          <Grain key={id} id={`grain-${id}`} seed={i * 7 + 3} down={grainDown(id)} />
        ))}
        <Grain id="grain-board" seed={41} down={false} />
        <Grain id="grain-floor" seed={59} down={false} strength={0.7} />
        <filter id="board-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.14" />
        </filter>
        <filter id="frame-depth" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0.025" dy="0.05" stdDeviation="0.035" floodColor="#3a2412" floodOpacity="0.5" />
        </filter>
        {/* The marks on the pieces, each fading out to its edge. */}
        <Mark id="mark-stain" stops={[['#8f5f30', 1], ['#8f5f30', 0.55], ['#8f5f30', 0]]} />
        <Mark id="mark-streak" stops={[['#5e4c3a', 1], ['#5e4c3a', 0.6], ['#5e4c3a', 0]]} />
        <Mark id="mark-knot" stops={[['#3d2412', 1], ['#4d2f17', 0.7], ['#7a5129', 0.18], ['#7a5129', 0]]} />
      </defs>
    </svg>
  )
}

/** Wood grain: stretched noise, tinted brown, kept inside the shape it is applied to. */
function Grain({ id, seed, down, strength = 1 }: { id: string; seed: number; down: boolean; strength?: number }) {
  // Basswood: fine, quiet fibres and a faint uneven tone, soft enough that no piece looks
  // lighter or darker than the rest.
  const freq = down ? '11 0.45' : '0.45 11'
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={seed} result="fibre" />
      <feColorMatrix
        in="fibre"
        type="matrix"
        values={`0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0 0.14  0 0 0 ${0.5 * strength} ${-0.22 * strength}`}
        result="lines"
      />
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={seed + 1} result="figure" />
      <feColorMatrix
        in="figure"
        type="matrix"
        values={`0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.18  0 0 0 ${0.13 * strength} ${-0.05 * strength}`}
        result="blotch"
      />
      <feMerge result="wood">
        <feMergeNode in="blotch" />
        <feMergeNode in="lines" />
      </feMerge>
      <feComposite in="wood" in2="SourceGraphic" operator="in" />
    </filter>
  )
}

function Mark({ id, stops }: { id: string; stops: [color: string, opacity: number][] }) {
  return (
    <radialGradient id={id}>
      {stops.map(([color, opacity], i) => (
        <stop key={i} offset={i / (stops.length - 1)} stopColor={color} stopOpacity={opacity} />
      ))}
    </radialGradient>
  )
}

/** A faint mark in a piece's wood, in the piece's own cells (as it lies before any turn). */
export interface WoodMark {
  kind: 'stain' | 'streak' | 'knot'
  cx: number
  cy: number
  rx: number
  ry: number
  /** Degrees off the line of the grain. */
  angle: number
  opacity: number
}

/** Sizes along and across the grain, and strength, of each kind of mark. */
const MARKS: Record<WoodMark['kind'], { along: [number, number]; across: [number, number]; opacity: [number, number] }> = {
  // A soft blotch where the wood is a little darker.
  stain: { along: [0.13, 0.24], across: [0.06, 0.1], opacity: [0.15, 0.21] },
  // A thin grey-brown mineral streak, running with the grain.
  streak: { along: [0.26, 0.42], across: [0.018, 0.028], opacity: [0.16, 0.24] },
  // A pin knot: a tiny dark dot in a faint halo.
  knot: { along: [0.08, 0.1], across: [0.07, 0.085], opacity: [0.24, 0.32] },
}

/** Seeded random numbers (mulberry32), so a piece keeps the same marks every time. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A few faint marks scattered over a piece, like those in real wood: one or
 * two stains, and maybe a streak or a pin knot. Always the same for a piece.
 */
export function woodMarks(id: PieceId): WoodMark[] {
  const rand = seeded(PIECE_IDS.indexOf(id) * 7919 + 101)
  const between = ([lo, hi]: [number, number]) => lo + (hi - lo) * rand()
  const cells = PIECE_BY_ID[id].cells
  const kinds: WoodMark['kind'][] = ['stain']
  if (rand() < 0.5) kinds.push('stain')
  if (rand() < 0.5) kinds.push('streak')
  if (rand() < 0.5) kinds.push('knot')
  if (kinds.length === 1) kinds.push('streak')

  const marks: WoodMark[] = []
  for (const kind of kinds) {
    // Somewhere on the piece, not crowding the marks already there.
    for (let tries = 0; tries < 30; tries++) {
      const [r, c] = cells[Math.floor(rand() * cells.length)]
      const cx = c + 0.15 + 0.7 * rand()
      const cy = r + 0.15 + 0.7 * rand()
      if (marks.some((m) => Math.hypot(m.cx - cx, m.cy - cy) < 0.8)) continue
      const size = MARKS[kind]
      const along = between(size.along)
      const across = between(size.across)
      marks.push({
        kind,
        cx,
        cy,
        rx: grainDown(id) ? across : along,
        ry: grainDown(id) ? along : across,
        angle: (rand() - 0.5) * 16,
        opacity: between(size.opacity),
      })
      break
    }
  }
  return marks
}
