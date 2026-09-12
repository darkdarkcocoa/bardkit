# bardkit

Server-side rules for [Bardkit](https://github.com/darkdarkcocoa/bardkit),
an in-game instrument performance system for multiplayer games.

The crate holds the half a server needs: the wire event type, the batch
validation rule, a per-connection token bucket, a registry of players
mid-performance, and the rule deciding which listeners hear a given performer.
It is transport agnostic and has one optional dependency, serde.

```rust
use bardkit::{valid_instrument_batch, should_hear, InstrumentBatchLimiter, LivePerformers};

if limiter.allow() && valid_instrument_batch(&events) && performers.is_live(&player_id) {
    // relay to every listener for which should_hear(..) is true
}
```

The limits both halves must agree on live in `limits.json` next to this
crate, and a test here asserts its constants against that file. The
TypeScript client imports the same file, so a change on one side fails the
other side's build.

See the [integration guide](https://github.com/darkdarkcocoa/bardkit/blob/main/docs/INTEGRATION.md)
for the message flow and the session rules.

Licensed under MIT OR Apache-2.0.
