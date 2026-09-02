import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import {
  closeInstrumentPanel,
  instrumentPanelVisible,
  openInstrumentPanel,
  setInstrumentVisibilityHook,
} from './instrumentStore'

beforeEach(() => {
  setInstrumentVisibilityHook(null)
  closeInstrumentPanel()
})

describe('instrumentStore', () => {
  it('toggles visibility', () => {
    openInstrumentPanel()
    expect(get(instrumentPanelVisible)).toBe(true)
    closeInstrumentPanel()
    expect(get(instrumentPanelVisible)).toBe(false)
  })

  it('reports each transition to the visibility hook', () => {
    const hook = vi.fn()
    setInstrumentVisibilityHook(hook)
    openInstrumentPanel()
    closeInstrumentPanel()
    expect(hook.mock.calls).toEqual([[true], [false]])
  })
})
