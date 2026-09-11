# Live Instrument Kit

[![CI](https://github.com/darkdarkcocoa/live-instrument-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/darkdarkcocoa/live-instrument-kit/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)

**Play a mandolin in the browser and let the players around you hear it.**

**[▶ Live demo](https://darkdarkcocoa.github.io/live-instrument-kit/)** — play
with your keyboard and hear yourself replayed as a nearby performer.

Live Instrument Kit is a drop-in performance system for multiplayer games: a
22-note keyboard HUD, a plucked-string synth that ships no samples, notes
batched for the wire, server-side validation and rate limiting, distance-based
playback for nearby listeners, and background music that steps aside while
someone plays. The reference skin is a mandolin; the note table, synth and UI
copy are the only mandolin-specific parts.

The kit is split so each half can be adopted independently.

```
packages/core         TypeScript, framework-free   notes · synth · input latch/batcher · remote replay · BGM yield
packages/ui-svelte    Svelte 5                      InstrumentPanel HUD + optional visibility store
packages/server-rust  Rust crate `live-instrument`  wire types · batch validation · token bucket · performer registry
examples/demo         Vite + Svelte                 loopback stage to play and hear the relay locally
docs/                 architecture, integration guide, asset provenance
```

## Try it

```bash
npm install
npm run dev        # http://localhost:5178
```

Click **Play instrument**, then play with `Q`–`I` (high), `A`–`J` (middle) and
`Z`–`M` (low). Every 250 ms batch is validated, delayed like a network hop and
replayed as a second performer at the distance you pick, so you hear what a
nearby player would.

## Verify

```bash
npm run verify     # prettier · svelte-check · vitest · cargo test
```

## What the kit decides, and what the host decides

| Kit                                                         | Host                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| Note table (C3–C6 naturals, A4 = 440 Hz), key map           | Who may perform (item, class, zone)                      |
| Synth voice, 4-voice pool, distance curve                   | Player positions, floors, world wrap                     |
| 250 ms batching, 16-note cap, offset rules                  | Transport (WebSocket, ENet, …) and message envelope      |
| Batch validation and 4/s token bucket                       | Relay to listeners, block lists, area of interest        |
| Remote replay with per-note gain resolution                 | What ends a performance (move, hit, trade, equip, death) |
| Playlist-quiet tracker (panel open, heard notes, 10 s hold) | The BGM player that fades out and back                   |
| Panel UI, keyboard capture, Escape to stop                  | Overlay stacking, camera lock, pose/emote animation      |

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for the hook points and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the pipeline and the numbers
behind it.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or
  <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or
  <http://opensource.org/licenses/MIT>)

at your option.

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in the work by you, as defined in the Apache-2.0
license, shall be dual licensed as above, without any additional terms or
conditions.

## Assets

The synth is procedural; the kit ships no third-party sound. The only binary
asset is the mandolin ornament behind the panel header, recorded in
[docs/ASSETS.md](docs/ASSETS.md).
