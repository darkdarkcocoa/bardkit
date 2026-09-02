import { writable } from 'svelte/store'

/**
 * Optional convenience for hosts that keep HUD state in Svelte stores.
 * `InstrumentPanel` itself only takes an `open` prop, so a host with its own
 * state model can ignore this file.
 */
export const instrumentPanelVisible = writable(false)

let onVisibility: ((visible: boolean) => void) | null = null

/** Runs on every open/close, e.g. to hold the BGM playlist quiet. */
export function setInstrumentVisibilityHook(
  hook: ((visible: boolean) => void) | null
) {
  onVisibility = hook
}

export function openInstrumentPanel() {
  instrumentPanelVisible.set(true)
  onVisibility?.(true)
}

export function closeInstrumentPanel() {
  instrumentPanelVisible.set(false)
  onVisibility?.(false)
}
