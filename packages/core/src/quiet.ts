type TimerHandle = ReturnType<typeof setTimeout>

export interface PlaylistQuietHooks {
  /** First source became active: fade the playlist out. */
  onEnter: () => void
  /** Last source released: bring the playlist back. */
  onLeave: () => void
}

export interface PlaylistQuietOptions {
  /** How long heard notes hold the playlist past the last one. */
  holdMs?: number
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  cancel?: (timer: TimerHandle) => void
}

export const LIVE_NOTES_QUIET_HOLD_MS = 10_000

/**
 * Tracks why the background playlist should stay silent. Sticky sources
 * (the local panel being open) are set and cleared; the transient source
 * (notes heard from a nearby performer) is held and released after a delay,
 * so a dramatic pause does not hand the speakers back mid-tune.
 */
export class PlaylistQuietTracker {
  private readonly sources = new Set<string>()
  private readonly holds = new Map<string, TimerHandle>()
  private readonly holdMs: number
  private readonly schedule: (
    callback: () => void,
    delayMs: number
  ) => TimerHandle
  private readonly cancel: (timer: TimerHandle) => void

  constructor(
    private readonly hooks: PlaylistQuietHooks,
    options: PlaylistQuietOptions = {}
  ) {
    this.holdMs = options.holdMs ?? LIVE_NOTES_QUIET_HOLD_MS
    this.schedule =
      options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
    this.cancel = options.cancel ?? ((timer) => clearTimeout(timer))
  }

  get quiet(): boolean {
    return this.sources.size > 0
  }

  set(source: string, active: boolean) {
    if (active) this.activate(source)
    else this.release(source)
  }

  hold(source: string, holdMs = this.holdMs) {
    const previous = this.holds.get(source)
    if (previous !== undefined) this.cancel(previous)
    this.holds.set(
      source,
      this.schedule(() => {
        this.holds.delete(source)
        this.release(source)
      }, holdMs)
    )
    this.activate(source)
  }

  clear() {
    for (const timer of this.holds.values()) this.cancel(timer)
    this.holds.clear()
    const wasQuiet = this.quiet
    this.sources.clear()
    if (wasQuiet) this.hooks.onLeave()
  }

  private activate(source: string) {
    const wasQuiet = this.quiet
    this.sources.add(source)
    if (!wasQuiet) this.hooks.onEnter()
  }

  private release(source: string) {
    const timer = this.holds.get(source)
    if (timer !== undefined) {
      this.cancel(timer)
      this.holds.delete(source)
    }
    if (!this.sources.delete(source)) return
    if (!this.quiet) this.hooks.onLeave()
  }
}
