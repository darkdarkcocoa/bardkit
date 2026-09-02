import { playInstrumentNote, stopInstrumentPerformer } from './audio'
import type { InstrumentNoteWireEvent } from './wire'

type TimerHandle = ReturnType<typeof setTimeout>

export interface RemoteInstrumentPlayerOptions {
  /** Upper bound on a relayed offset, so a hostile batch cannot park timers. */
  maxDelayMs?: number
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  cancel?: (timer: TimerHandle) => void
  /** Injected for tests; defaults to the shared synth. */
  play?: (note: number, performerId: number | string, gain: number) => void
  stopPerformer?: (performerId: number | string) => void
}

/**
 * Replays a performer's relayed batch with its relative offsets. The host
 * resolves gain at strike time (distance, floor, mute) so a listener who
 * walks away mid-batch hears the notes fade rather than a stale level.
 */
export class RemoteInstrumentPlayer {
  private readonly timers = new Map<number | string, Set<TimerHandle>>()
  private readonly maxDelayMs: number
  private readonly schedule: (
    callback: () => void,
    delayMs: number
  ) => TimerHandle
  private readonly cancel: (timer: TimerHandle) => void
  private readonly playNote: (
    note: number,
    performerId: number | string,
    gain: number
  ) => void
  private readonly stopPerformerAudio: (performerId: number | string) => void

  constructor(options: RemoteInstrumentPlayerOptions = {}) {
    this.maxDelayMs = options.maxDelayMs ?? 1000
    this.schedule =
      options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
    this.cancel = options.cancel ?? ((timer) => clearTimeout(timer))
    this.playNote =
      options.play ??
      ((note, performerId, gain) => {
        playInstrumentNote(note, performerId, gain)
      })
    this.stopPerformerAudio = options.stopPerformer ?? stopInstrumentPerformer
  }

  get pendingCount(): number {
    let count = 0
    for (const timers of this.timers.values()) count += timers.size
    return count
  }

  play(
    performerId: number | string,
    events: readonly InstrumentNoteWireEvent[],
    resolveGain: () => number,
    onSounded?: (gain: number) => void
  ) {
    if (!Array.isArray(events)) return

    const strike = (note: number) => {
      const gain = resolveGain()
      if (!Number.isFinite(gain) || gain <= 0) return
      onSounded?.(gain)
      this.playNote(note, performerId, gain)
    }

    let timers = this.timers.get(performerId)
    if (!timers) {
      timers = new Set()
      this.timers.set(performerId, timers)
    }

    for (const event of events) {
      if (!Number.isInteger(event.note) || !Number.isFinite(event.offset_ms)) {
        continue
      }
      const delay = Math.max(0, Math.min(this.maxDelayMs, event.offset_ms))
      if (delay === 0) {
        strike(event.note)
        continue
      }
      const owner = timers
      const timer = this.schedule(() => {
        owner.delete(timer)
        if (owner.size === 0 && this.timers.get(performerId) === owner) {
          this.timers.delete(performerId)
        }
        strike(event.note)
      }, delay)
      owner.add(timer)
    }
    if (timers.size === 0) this.timers.delete(performerId)
  }

  /** Drops queued notes and silences what already sounds for one performer. */
  stop(performerId: number | string) {
    const timers = this.timers.get(performerId)
    if (timers) {
      for (const timer of timers) this.cancel(timer)
      this.timers.delete(performerId)
    }
    this.stopPerformerAudio(performerId)
  }

  stopAll() {
    for (const performerId of [...this.timers.keys()]) this.stop(performerId)
  }
}
