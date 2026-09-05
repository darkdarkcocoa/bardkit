import { INSTRUMENT_NOTE_COUNT } from './notes'
import limits from './limits.json'

/**
 * Wire-level limits, read from the one file both halves of the kit share.
 * The Rust crate's constants are checked against the same file in its tests.
 */
export const INSTRUMENT_LIMITS = limits
export const INSTRUMENT_BATCH_MS: number = limits.batchMs
export const INSTRUMENT_BATCH_MAX_EVENTS: number = limits.maxEventsPerBatch
export const INSTRUMENT_AUDIBLE_RADIUS: number = limits.audibleRadiusMeters

/** One struck note inside a batch, `offsetMs` relative to the batch's first note. */
export interface InstrumentNoteEvent {
  note: number
  offsetMs: number
}

/** The same event as the server crate serializes it (snake_case). */
export interface InstrumentNoteWireEvent {
  note: number
  offset_ms: number
}

export function toWireEvents(
  events: readonly InstrumentNoteEvent[]
): InstrumentNoteWireEvent[] {
  return events.map((event) => ({
    note: event.note,
    offset_ms: event.offsetMs,
  }))
}

export function fromWireEvents(
  events: readonly InstrumentNoteWireEvent[]
): InstrumentNoteEvent[] {
  return events.map((event) => ({
    note: event.note,
    offsetMs: event.offset_ms,
  }))
}

/** Mirror of the server's batch check, for hosts whose server is not the Rust crate. */
export function isValidInstrumentBatch(
  events: readonly InstrumentNoteWireEvent[]
): boolean {
  if (
    events.length === 0 ||
    events.length > INSTRUMENT_BATCH_MAX_EVENTS ||
    events[0].offset_ms !== 0
  ) {
    return false
  }
  for (let i = 0; i < events.length; i++) {
    const { note, offset_ms } = events[i]
    if (!Number.isInteger(note) || note < 0 || note >= INSTRUMENT_NOTE_COUNT) {
      return false
    }
    if (!Number.isInteger(offset_ms) || offset_ms < 0) return false
    if (offset_ms >= INSTRUMENT_BATCH_MS) return false
    if (i > 0 && events[i - 1].offset_ms > offset_ms) return false
  }
  return true
}
