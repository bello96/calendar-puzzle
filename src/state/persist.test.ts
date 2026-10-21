import { describe, expect, it } from 'vitest'
import { PIECE_IDS } from '../game/pieces'
import { parseSaved } from './persist'

function savedJson(overrides: Record<string, unknown> = {}, pieceOverrides: Record<string, unknown> = {}) {
  const pieces = Object.fromEntries(
    PIECE_IDS.map((id, i) => [id, { id, turns: 0, flips: 0, spot: { kind: 'loose', x: 10, y: i * 2 }, z: i, tilt: 1 }]),
  )
  return JSON.stringify({
    version: 1,
    pieces: { ...pieces, ...pieceOverrides },
    layout: { mode: 'wide', arrangement: 'block', scale: 1 },
    timerDay: null,
    target: { kind: 'today' },
    sound: false,
    startedAt: null,
    finishedAt: null,
    usedAnswer: false,
    ...overrides,
  })
}

describe('parseSaved', () => {
  it('restores a saved table', () => {
    const saved = parseSaved(savedJson({}, { I4: { id: 'I4', turns: 1, flips: 0, spot: { kind: 'board', row: 2, col: 6 }, z: 9, tilt: 0 } }))
    expect(saved?.pieces.I4.spot).toEqual({ kind: 'board', row: 2, col: 6 })
    expect(saved?.pieces.I4.motion).toEqual({ kind: 'jump' })
    expect(saved?.sound).toBe(false)
  })

  it('ranks the stacking order from 0, keeping the order', () => {
    const json = JSON.parse(savedJson())
    PIECE_IDS.forEach((id, i) => (json.pieces[id].z = 5000 - i * 3))
    const saved = parseSaved(JSON.stringify(json))!
    // The first piece had the highest z, so it stays on top.
    expect(PIECE_IDS.map((id) => saved.pieces[id].z)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
  })

  it('rejects pieces that overlap in the board', () => {
    const json = savedJson({}, {
      I4: { id: 'I4', turns: 0, flips: 0, spot: { kind: 'board', row: 6, col: 0 }, z: 1, tilt: 0 },
      L4: { id: 'L4', turns: 0, flips: 0, spot: { kind: 'board', row: 5, col: 0 }, z: 2, tilt: 0 },
    })
    expect(parseSaved(json)).toBeNull()
  })

  it('rejects a piece hanging off the board', () => {
    const json = savedJson({}, { I4: { id: 'I4', turns: 0, flips: 0, spot: { kind: 'board', row: 0, col: 3 }, z: 1, tilt: 0 } })
    expect(parseSaved(json)).toBeNull()
  })

  it('rejects a save with a piece missing', () => {
    const json = JSON.parse(savedJson())
    delete json.pieces.Z5
    expect(parseSaved(JSON.stringify(json))).toBeNull()
  })

  it('keeps the pieces of a save whose tray is no longer known, letting the table pick one', () => {
    const saved = parseSaved(savedJson({ layout: { mode: 'wide', arrangement: 'rows3', scale: 1 } }))
    expect(saved?.layout).toBeNull()
    expect(saved?.pieces.I4.spot).toEqual({ kind: 'loose', x: 10, y: 0 })
  })

  it('rejects junk', () => {
    expect(parseSaved('not json')).toBeNull()
    expect(parseSaved(savedJson({ version: 99 }))).toBeNull()
    expect(parseSaved(savedJson({ target: { kind: 'date', y: 2026, m: 13, d: 1 } }))).toBeNull()
  })
})
