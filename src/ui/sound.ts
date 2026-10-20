import { useGame } from '../state/store'

/*
 * A wooden knock and a small chime, synthesised with Web Audio so the page
 * needs no sound files. The context is created lazily on the first gesture.
 */

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.1), ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

/** A knock: a filtered click for the contact plus a short falling tone for the body of the wood. */
function knock(ac: AudioContext, pitch: number, level: number, ring: number, at = ac.currentTime) {
  const click = ac.createBufferSource()
  click.buffer = noise(ac)
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = pitch * 4
  band.Q.value = 1.4
  const clickGain = ac.createGain()
  clickGain.gain.setValueAtTime(level, at)
  clickGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035)
  click.connect(band).connect(clickGain).connect(ac.destination)
  click.start(at)
  click.stop(at + 0.05)

  const body = ac.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(pitch, at)
  body.frequency.exponentialRampToValueAtTime(pitch * 0.72, at + ring)
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(level * 0.7, at)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + ring)
  body.connect(bodyGain).connect(ac.destination)
  body.start(at)
  body.stop(at + ring + 0.02)
}

function bell(ac: AudioContext, freq: number, at: number) {
  for (const [ratio, level] of [
    [1, 0.16],
    [2.76, 0.05],
    [5.4, 0.02],
  ]) {
    const osc = ac.createOscillator()
    osc.frequency.value = freq * ratio
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(level, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1 / ratio)
    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + 1.2)
  }
}

// Moving pieces about is silent; the only knock is a piece dropping into the board.
const SOUNDS = {
  /** A piece drops into the board. */
  place: (ac: AudioContext) => knock(ac, 300, 0.32, 0.09),
  /** The puzzle is solved: a rising marimba-ish triad. */
  solved: (ac: AudioContext) => [523.25, 659.25, 783.99].forEach((f, i) => bell(ac, f, ac.currentTime + i * 0.11)),
} satisfies Record<string, (ac: AudioContext) => void>

/**
 * Starting audio takes a moment the first time; do it as a press begins
 * rather than once a piece is already moving.
 */
export function warmUpSound(): void {
  if (!ctx && useGame.getState().sound) audio()
}

export function play(name: keyof typeof SOUNDS): void {
  if (!useGame.getState().sound) return
  const ac = audio()
  if (ac) SOUNDS[name](ac)
}
