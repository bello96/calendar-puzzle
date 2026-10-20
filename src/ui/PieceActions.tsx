import { bounds } from '../game/geometry'
import { centerOf, shapeOf } from '../game/state'
import { useGame } from '../state/store'
import { pivotAt } from './Piece'
import { useTable } from './table-context'

/** On touch screens: turn and flip buttons above the piece last touched. */
export function PieceActions() {
  const { cell, origin, visible, layout } = useTable()
  const piece = useGame((s) => (s.activeId && !s.draggingId ? s.pieces[s.activeId] : null))
  if (!piece) return null

  const center = centerOf(piece)
  const scale = piece.spot.kind === 'loose' && layout.inTray(center) ? layout.trayScale : 1
  const { rows } = bounds(shapeOf(piece))
  const top = center.y - (rows / 2) * scale
  const left = Math.min(Math.max(center.x, visible.left + 1.6), visible.right - 1.6)
  const act = (change: 1 | 'flip') => {
    const game = useGame.getState()
    const pivot = pivotAt(piece, center, scale)
    if (change === 'flip') game.flipPiece(piece.id, pivot)
    else game.turnPiece(piece.id, 1, pivot)
  }

  return (
    <div
      className="absolute z-[1200] flex -translate-x-1/2 -translate-y-full gap-1 rounded-full bg-mat-deep/95 p-1 shadow-lg shadow-black/30"
      style={{ left: (left - origin.x) * cell, top: Math.max((top - origin.y) * cell - 10, 52) }}
    >
      <button
        type="button"
        className="h-9 rounded-full px-3.5 text-[15px] text-chalk active:bg-chalk/15"
        onClick={() => act(1)}
      >
        旋转
      </button>
      <button
        type="button"
        className="h-9 rounded-full px-3.5 text-[15px] text-chalk active:bg-chalk/15"
        onClick={() => act('flip')}
      >
        翻面
      </button>
    </div>
  )
}
