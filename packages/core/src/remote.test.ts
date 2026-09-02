import { describe, expect, it, vi } from 'vitest'
import { RemoteInstrumentPlayer } from './remote'

type Timer = ReturnType<typeof setTimeout>

function fakeClock() {
  const queue: { at: number; run: () => void; id: number }[] = []
  let now = 0
  let nextId = 1
  return {
    schedule: (callback: () => void, delay: number) => {
      const id = nextId++
      queue.push({ at: now + delay, run: callback, id })
      return id as unknown as Timer
    },
    cancel: (timer: Timer) => {
      const index = queue.findIndex((entry) => entry.id === (timer as unknown))
      if (index >= 0) queue.splice(index, 1)
    },
    advance(ms: number) {
      now += ms
      queue.sort((a, b) => a.at - b.at)
      while (queue.length && queue[0].at <= now) queue.shift()!.run()
    },
  }
}

describe('RemoteInstrumentPlayer', () => {
  it('replays offsets and resolves gain when each note sounds', () => {
    const clock = fakeClock()
    const play = vi.fn()
    const player = new RemoteInstrumentPlayer({ ...clock, play })
    let gain = 1

    player.play(
      7,
      [
        { note: 0, offset_ms: 0 },
        { note: 4, offset_ms: 120 },
      ],
      () => gain
    )
    expect(play).toHaveBeenCalledWith(0, 7, 1)
    expect(player.pendingCount).toBe(1)

    gain = 0.25
    clock.advance(120)
    expect(play).toHaveBeenCalledWith(4, 7, 0.25)
    expect(player.pendingCount).toBe(0)
  })

  it('skips silent notes, clamps hostile offsets and ignores junk events', () => {
    const clock = fakeClock()
    const play = vi.fn()
    const sounded = vi.fn()
    const player = new RemoteInstrumentPlayer({
      ...clock,
      play,
      maxDelayMs: 500,
    })

    player.play(
      'p',
      [
        { note: 1, offset_ms: 0 },
        { note: 2, offset_ms: 60_000 },
        { note: 1.5, offset_ms: 10 },
        { note: 3, offset_ms: Number.NaN },
      ],
      () => 0,
      sounded
    )
    expect(play).not.toHaveBeenCalled()
    expect(sounded).not.toHaveBeenCalled()
    expect(player.pendingCount).toBe(1)

    clock.advance(500)
    expect(player.pendingCount).toBe(0)
  })

  it('stop drops queued notes and silences the performer', () => {
    const clock = fakeClock()
    const play = vi.fn()
    const stopPerformer = vi.fn()
    const player = new RemoteInstrumentPlayer({
      ...clock,
      play,
      stopPerformer,
    })

    player.play(
      'a',
      [
        { note: 0, offset_ms: 0 },
        { note: 1, offset_ms: 100 },
      ],
      () => 1
    )
    player.play(
      'b',
      [
        { note: 0, offset_ms: 0 },
        { note: 2, offset_ms: 100 },
      ],
      () => 1
    )
    player.stop('a')
    clock.advance(100)

    expect(stopPerformer).toHaveBeenCalledWith('a')
    expect(play).toHaveBeenCalledTimes(3)
    expect(play).not.toHaveBeenCalledWith(1, 'a', 1)
    expect(play).toHaveBeenCalledWith(2, 'b', 1)
  })
})
