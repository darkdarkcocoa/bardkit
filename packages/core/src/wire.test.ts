import { describe, expect, it } from 'vitest'
import {
  INSTRUMENT_AUDIBLE_RADIUS,
  INSTRUMENT_BATCH_MAX_EVENTS,
  INSTRUMENT_BATCH_MS,
  INSTRUMENT_LIMITS,
  fromWireEvents,
  isValidInstrumentBatch,
  toWireEvents,
} from './wire'
import { INSTRUMENT_NOTE_COUNT } from './notes'

describe('shared limits', () => {
  it('match the note table and the wire constants', () => {
    expect(INSTRUMENT_LIMITS.noteCount).toBe(INSTRUMENT_NOTE_COUNT)
    expect(INSTRUMENT_BATCH_MS).toBe(250)
    expect(INSTRUMENT_BATCH_MAX_EVENTS).toBe(16)
    expect(INSTRUMENT_AUDIBLE_RADIUS).toBe(30)
  })
})

const batch = [
  { note: 0, offset_ms: 0 },
  { note: 7, offset_ms: 80 },
  { note: 21, offset_ms: 249 },
]

describe('isValidInstrumentBatch', () => {
  it('accepts an ordered batch inside every bound', () => {
    expect(isValidInstrumentBatch(batch)).toBe(true)
    expect(
      isValidInstrumentBatch(
        Array.from({ length: INSTRUMENT_BATCH_MAX_EVENTS }, () => batch[0])
      )
    ).toBe(true)
  })

  it('rejects empty, oversized, late-starting, out-of-range and unordered batches', () => {
    expect(isValidInstrumentBatch([])).toBe(false)
    expect(
      isValidInstrumentBatch(
        Array.from({ length: INSTRUMENT_BATCH_MAX_EVENTS + 1 }, () => batch[0])
      )
    ).toBe(false)
    expect(isValidInstrumentBatch([{ note: 0, offset_ms: 1 }])).toBe(false)
    expect(isValidInstrumentBatch([{ note: 22, offset_ms: 0 }])).toBe(false)
    expect(isValidInstrumentBatch([{ note: 1.5, offset_ms: 0 }])).toBe(false)
    expect(
      isValidInstrumentBatch([batch[0], { note: 0, offset_ms: 250 }])
    ).toBe(false)
    expect(
      isValidInstrumentBatch([batch[0], batch[1], { note: 2, offset_ms: 79 }])
    ).toBe(false)
  })
})

describe('wire conversion', () => {
  it('round-trips between camelCase and snake_case events', () => {
    const local = fromWireEvents(batch)
    expect(local).toEqual([
      { note: 0, offsetMs: 0 },
      { note: 7, offsetMs: 80 },
      { note: 21, offsetMs: 249 },
    ])
    expect(toWireEvents(local)).toEqual(batch)
  })
})
