import { orientations, type Cell } from '../geometry'

/** Identical for shapes that are congruent under rotation and mirroring. */
export function canonical(cells: readonly Cell[]): string {
  return orientations(cells)
    .map((o) => o.cells.map(([r, c]) => `${r},${c}`).join(';'))
    .sort()[0]
}
