import { describe, expect, it, vi } from 'vitest'
import { PlaylistQuietTracker } from './quiet'

type Timer = ReturnType<typeof setTimeout>

function tracker(holdMs?: number) {
  const hooks = { onEnter: vi.fn(), onLeave: vi.fn() }
  let scheduled: { run: () => void; id: number }[] = []
  let nextId = 1
  const t = new PlaylistQuietTracker(hooks, {
    holdMs,
    schedule: (callback) => {
      const id = nextId++
      scheduled.push({ run: callback, id })
      return id as unknown as Timer
    },
    cancel: (timer) => {
      scheduled = scheduled.filter((entry) => entry.id !== (timer as unknown))
    },
  })
  const fire = () => {
    const batch = scheduled
    scheduled = []
    for (const entry of batch) entry.run()
  }
  return { t, hooks, fire, pending: () => scheduled.length }
}

describe('PlaylistQuietTracker', () => {
  it('enters once for overlapping sources and leaves when the last releases', () => {
    const { t, hooks } = tracker()
    t.set('panel', true)
    t.set('bard-zone', true)
    expect(hooks.onEnter).toHaveBeenCalledOnce()
    expect(t.quiet).toBe(true)

    t.set('panel', false)
    expect(hooks.onLeave).not.toHaveBeenCalled()
    t.set('bard-zone', false)
    expect(hooks.onLeave).toHaveBeenCalledOnce()
    expect(t.quiet).toBe(false)
  })

  it('ignores redundant sets', () => {
    const { t, hooks } = tracker()
    t.set('panel', false)
    t.set('panel', true)
    t.set('panel', true)
    expect(hooks.onEnter).toHaveBeenCalledOnce()
    expect(hooks.onLeave).not.toHaveBeenCalled()
  })

  it('holds heard notes and releases after the delay, restarting on each note', () => {
    const { t, hooks, fire, pending } = tracker(10_000)
    t.hold('heard')
    t.hold('heard')
    expect(hooks.onEnter).toHaveBeenCalledOnce()
    expect(pending()).toBe(1)

    fire()
    expect(hooks.onLeave).toHaveBeenCalledOnce()
    expect(t.quiet).toBe(false)
  })

  it('does not leave while a sticky source outlives a hold', () => {
    const { t, hooks, fire } = tracker()
    t.set('panel', true)
    t.hold('heard')
    fire()
    expect(hooks.onLeave).not.toHaveBeenCalled()
    t.set('panel', false)
    expect(hooks.onLeave).toHaveBeenCalledOnce()
  })

  it('clear cancels holds and leaves at most once', () => {
    const { t, hooks, pending } = tracker()
    t.hold('heard')
    t.set('panel', true)
    t.clear()
    expect(pending()).toBe(0)
    expect(hooks.onLeave).toHaveBeenCalledOnce()
    t.clear()
    expect(hooks.onLeave).toHaveBeenCalledOnce()
  })
})
