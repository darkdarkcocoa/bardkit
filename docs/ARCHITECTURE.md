# Architecture

## Pipeline

```
 performer client                     server                         listener client
 ───────────────                      ──────                         ───────────────
 key down ─► InstrumentKeyLatch       InstrumentBatchLimiter         PlayerInstrumentNotes
   │ (once per press)                   │ 4 batches/s, burst 4         │
   ├─► playInstrumentNote (local,       ▼                              ▼
   │   zero latency)                  valid_instrument_batch         RemoteInstrumentPlayer
   └─► InstrumentNoteBatcher            │ ≤16 notes, offsets 0..249,     │ setTimeout per offset
         │ 250 ms window, offsets       │ ordered, first at 0            │ gain resolved at strike:
         │ relative to first note       ▼                                │ instrumentDistanceGain(d)
         ▼                            LivePerformers.is_live?             ▼
 onNotes(events) ─► transport ─►      snapshot performer pos/floor ─►   playInstrumentNote(note, id, gain)
                                      relay to same floor ≤ 30 m,        │
                                      minus performer, minus blockers    └─► PlaylistQuietTracker.hold()
```

Local notes never wait for the server. The audience hears the batch one
network hop plus up to 250 ms later, with the performer's rhythm preserved by
the relative offsets.

## Notes

22 natural notes C3–C6 in twelve-tone equal temperament with A4 = 440 Hz.
Three keyboard rows map to three registers:

| Register | Keys              | Notes                   |
| -------- | ----------------- | ----------------------- |
| High     | `Q W E R T Y U I` | C5 D5 E5 F5 G5 A5 B5 C6 |
| Middle   | `A S D F G H J`   | C4 D4 E4 F4 G4 A4 B4    |
| Low      | `Z X C V B N M`   | C3 D3 E3 F3 G3 A3 B3    |

Each note carries a measured one-shot duration (1.0–3.5 s) that sizes its
synthesized buffer. `InstrumentKeyLatch` fires once per physical press and
rearms on release; mouse and touch share the latch through the panel.

## Synth

`playInstrumentNote` renders a Karplus–Strong plucked string per note on first
use and caches the buffer: a noise-filled delay line of one period, averaged
and damped each pass (decay to −52 dB over the note's duration), a DC blocker,
a 4 ms attack and 25 ms release. Each voice runs through a low-pass "body"
filter, a dry path and a short procedural room impulse (0.38 s exponential
noise), then a shared master gain and a limiter.

`InstrumentVoicePool` caps concurrent voices at four. A fifth steals the
oldest; re-striking the same performer's note replaces its previous voice so
tremolo never stacks.

`setInstrumentMasterVolume` / `setInstrumentMuted` are the host's hooks into
the master gain. Nothing in `core` imports a UI framework.

## Distance

`instrumentDistanceGain` interpolates in dB between measured points: full
gain to 3 m, −4 dB at 10 m, −8.8 dB at 25 m, then a steep roll-off to silence
at 30 m, matching the server's 30 m relay radius so nothing arrives that
cannot be heard. The listener resolves gain at each note's strike time, so a
listener walking away hears the tail of a batch fade.

## Batching and the wire

`InstrumentNoteBatcher` opens a 250 ms window at the first strike, records
each later strike as an offset from the window start (clamped to 0–249),
flushes on the timer, and flushes early when the window would otherwise reach
16 notes. Wire events are `{ note: u8, offset_ms: u16 }` in snake_case;
`toWireEvents` / `fromWireEvents` convert.

The server accepts a batch only if it is non-empty, at most 16 notes, starts
at offset 0, stays below 250 ms, names notes below 22 and keeps offsets
non-decreasing. `isValidInstrumentBatch` in `core` is the same rule for hosts
without a Rust server. The numbers themselves are defined once, in
`packages/server-rust/limits.json`; the TypeScript side imports it and the Rust
crate's tests assert its constants against it.

## Rate limiting

One `InstrumentBatchLimiter` per connection: a token bucket refilling at four
batches per second up to a burst of four. An honest client produces at most
one batch per 250 ms, so the limit is invisible to players and cheap against
floods. Check the limiter before validating so a rejected flood costs one
comparison.

## Session state

`LivePerformers<Id>` is the server's set of players mid-performance. `start`
returns `false` for a duplicate so the host skips a second start broadcast;
`stop` returns `true` only when a performance actually ended so the host
clears the pose only for players who had one. The host decides what calls
`stop`: movement, an attack, a landed hit, death, equipment change, an opened
trade, Escape and disconnect in the reference integration.

## Background music yield

`PlaylistQuietTracker` holds a set of reasons the playlist should be silent.
Sticky sources are set and cleared (the local panel is open; a bard NPC is in
earshot). The transient source is `hold`, restarted by every heard note and
released 10 s after the last one, so a dramatic pause does not hand the
speakers back mid-tune. `onEnter` fires once when the first source arrives,
`onLeave` once when the last leaves; the host's BGM player fades on those.
