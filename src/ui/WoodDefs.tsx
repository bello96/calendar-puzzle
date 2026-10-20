import { PIECE_IDS } from '../game/pieces'

/**
 * Shared SVG filters. Units are cells (every board and piece SVG uses a
 * viewBox measured in cells), so the grain has the same scale everywhere.
 */
export function WoodDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {PIECE_IDS.map((id, i) => (
          <Grain key={id} id={`grain-${id}`} seed={i * 7 + 3} across={i % 3 === 1} />
        ))}
        <Grain id="grain-board" seed={41} across={false} />
        <Grain id="grain-floor" seed={59} across={false} strength={0.7} />
        <filter id="board-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.14" />
        </filter>
        <filter id="frame-depth" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0.025" dy="0.05" stdDeviation="0.035" floodColor="#3a2412" floodOpacity="0.5" />
        </filter>
      </defs>
    </svg>
  )
}

/** Wood grain: stretched noise, tinted brown, kept inside the shape it is applied to. */
function Grain({ id, seed, across, strength = 1 }: { id: string; seed: number; across: boolean; strength?: number }) {
  // Basswood: fine, quiet fibres and a faint uneven tone, soft enough that no piece looks
  // lighter or darker than the rest.
  const freq = across ? '11 0.45' : '0.45 11'
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
