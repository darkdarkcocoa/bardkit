import { describe, expect, it } from 'vitest'
import {
  INSTRUMENT_BATCH_MAX_EVENTS,
  fromWireEvents,
  isValidInstrumentBatch,
  toWireEvents,
} from './wire'

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
