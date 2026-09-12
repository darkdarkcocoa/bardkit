//! Server-side half of Bardkit: in-game instrument performance.
//!
//! The crate is transport- and engine-agnostic: it knows the wire shape of a
//! note batch, how to validate one, how to throttle a sender and which
//! players are mid-performance. Relaying to nearby listeners, checking
//! inventory and ending a performance on movement stay in the host, which
//! owns those systems. See `docs/INTEGRATION.md` for the hook points.

use std::collections::HashSet;
use std::hash::Hash;
use std::time::Instant;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

// These mirror `packages/core/src/limits.json`; the test module checks them
// against that file so the two halves cannot drift apart.

/// Notes the client keyboard can strike: C3..C6 natural notes, index order.
pub const INSTRUMENT_NOTE_COUNT: u8 = 22;
/// A batch covers this window; offsets inside it are relative to its first note.
pub const INSTRUMENT_BATCH_MS: u16 = 250;
/// Hands top out near ten notes per 250 ms; slack beyond that only serves
/// clients flooding listeners, who build audio nodes per note received.
pub const MAX_INSTRUMENT_EVENTS_PER_BATCH: usize = 16;
/// Listeners farther than this from the performer receive nothing.
pub const INSTRUMENT_AUDIBLE_RADIUS: f32 = 30.0;
/// Batch rate a well-behaved client can reach (one per window) plus burst room.
pub const INSTRUMENT_BATCHES_PER_SEC: f32 = 4.0;
pub const INSTRUMENT_BATCH_BURST: f32 = 4.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct InstrumentNoteEvent {
    pub note: u8,
    pub offset_ms: u16,
}

/// A batch is non-empty, capped, starts at offset 0, stays inside the window,
/// names only real notes and keeps its offsets in order.
pub fn valid_instrument_batch(events: &[InstrumentNoteEvent]) -> bool {
    if events.is_empty()
        || events.len() > MAX_INSTRUMENT_EVENTS_PER_BATCH
        || events[0].offset_ms != 0
    {
        return false;
    }

    events
        .iter()
        .all(|event| event.note < INSTRUMENT_NOTE_COUNT && event.offset_ms < INSTRUMENT_BATCH_MS)
        && events
            .windows(2)
            .all(|pair| pair[0].offset_ms <= pair[1].offset_ms)
}

/// Token bucket, one per connection: refills at [`INSTRUMENT_BATCHES_PER_SEC`]
/// up to [`INSTRUMENT_BATCH_BURST`]. Check it before validating a batch so a
/// flood costs the server nothing but the comparison.
#[derive(Debug, Clone)]
pub struct InstrumentBatchLimiter {
    tokens: f32,
    last: Instant,
}

impl Default for InstrumentBatchLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl InstrumentBatchLimiter {
    pub fn new() -> Self {
        Self::starting_at(Instant::now())
    }

    pub fn starting_at(now: Instant) -> Self {
        Self {
            tokens: INSTRUMENT_BATCH_BURST,
            last: now,
        }
    }

    pub fn allow(&mut self) -> bool {
        self.allow_at(Instant::now())
    }

    pub fn allow_at(&mut self, now: Instant) -> bool {
        let elapsed = now.saturating_duration_since(self.last).as_secs_f32();
        self.tokens =
            (self.tokens + elapsed * INSTRUMENT_BATCHES_PER_SEC).min(INSTRUMENT_BATCH_BURST);
        self.last = now;
        if self.tokens < 1.0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }
}

/// Who is mid-performance. The host wraps it in whatever lock it uses for
/// per-player state; if that lock is not reentrant (tokio's `RwLock`), drop
/// the guard before calling back into code that takes it again.
#[derive(Debug, Default)]
pub struct LivePerformers<Id: Hash + Eq + Copy> {
    live: HashSet<Id>,
}

impl<Id: Hash + Eq + Copy> LivePerformers<Id> {
    pub fn new() -> Self {
        Self {
            live: HashSet::new(),
        }
    }

    /// `false` when the player was already performing; callers use that to
    /// skip a duplicate start broadcast.
    pub fn start(&mut self, id: Id) -> bool {
        self.live.insert(id)
    }

    /// `true` when a performance actually ended; callers use that to clear
    /// the pose only for players who had one.
    pub fn stop(&mut self, id: &Id) -> bool {
        self.live.remove(id)
    }

    pub fn is_live(&self, id: &Id) -> bool {
        self.live.contains(id)
    }

    pub fn len(&self) -> usize {
        self.live.len()
    }

    pub fn is_empty(&self) -> bool {
        self.live.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Id> {
        self.live.iter()
    }
}

/// Which listeners a batch reaches: same floor, inside the radius, not the
/// performer, and not anyone who blocked the performer. `distance` is the
/// host's metric (it may wrap a cylindrical world).
pub fn should_hear<Id: PartialEq>(
    listener: &Id,
    performer: &Id,
    same_floor: bool,
    distance: f32,
    listener_blocked_performer: bool,
) -> bool {
    listener != performer
        && same_floor
        && distance <= INSTRUMENT_AUDIBLE_RADIUS
        && !listener_blocked_performer
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn notes() -> Vec<InstrumentNoteEvent> {
        vec![
            InstrumentNoteEvent {
                note: 0,
                offset_ms: 0,
            },
            InstrumentNoteEvent {
                note: 7,
                offset_ms: 80,
            },
            InstrumentNoteEvent {
                note: 21,
                offset_ms: 249,
            },
        ]
    }

    #[test]
    fn batch_validation_covers_every_wire_bound() {
        assert!(valid_instrument_batch(&notes()));
        assert!(!valid_instrument_batch(&[]));

        let too_many = vec![
            InstrumentNoteEvent {
                note: 0,
                offset_ms: 0,
            };
            MAX_INSTRUMENT_EVENTS_PER_BATCH + 1
        ];
        assert!(!valid_instrument_batch(&too_many));
        assert!(valid_instrument_batch(
            &too_many[..MAX_INSTRUMENT_EVENTS_PER_BATCH]
        ));

        let mut invalid_note = notes();
        invalid_note[1].note = INSTRUMENT_NOTE_COUNT;
        assert!(!valid_instrument_batch(&invalid_note));

        let mut leading_offset = notes();
        leading_offset[0].offset_ms = 1;
        assert!(!valid_instrument_batch(&leading_offset));

        let mut late = notes();
        late[2].offset_ms = INSTRUMENT_BATCH_MS;
        assert!(!valid_instrument_batch(&late));

        let mut reversed = notes();
        reversed[2].offset_ms = 79;
        assert!(!valid_instrument_batch(&reversed));
    }

    #[test]
    fn limiter_allows_four_per_second_with_a_four_batch_burst() {
        let start = Instant::now();
        let mut limiter = InstrumentBatchLimiter::starting_at(start);

        for _ in 0..4 {
            assert!(limiter.allow_at(start));
        }
        assert!(!limiter.allow_at(start));
        assert!(!limiter.allow_at(start + Duration::from_millis(249)));
        assert!(limiter.allow_at(start + Duration::from_millis(250)));
        assert!(!limiter.allow_at(start + Duration::from_millis(250)));
        assert!(limiter.allow_at(start + Duration::from_millis(500)));
    }

    #[test]
    fn performers_report_real_transitions_only() {
        let mut live = LivePerformers::new();
        assert!(live.start(7u32));
        assert!(!live.start(7));
        assert!(live.is_live(&7));
        assert_eq!(live.len(), 1);
        assert!(live.stop(&7));
        assert!(!live.stop(&7));
        assert!(live.is_empty());
    }

    #[test]
    fn hearing_rules_match_the_relay_filter() {
        assert!(should_hear(&2u32, &1, true, 29.9, false));
        assert!(!should_hear(&1u32, &1, true, 0.0, false));
        assert!(!should_hear(&2u32, &1, false, 1.0, false));
        assert!(!should_hear(&2u32, &1, true, 30.1, false));
        assert!(!should_hear(&2u32, &1, true, 1.0, true));
    }

    #[cfg(feature = "serde")]
    #[test]
    fn events_serialize_with_snake_case_fields() {
        let json = serde_json::to_string(&notes()[1]).unwrap();
        assert_eq!(json, r#"{"note":7,"offset_ms":80}"#);
    }

    #[test]
    fn constants_match_the_shared_limits_file() {
        let limits: serde_json::Value =
            serde_json::from_str(include_str!("../../core/src/limits.json")).unwrap();
        assert_eq!(limits["noteCount"], u64::from(INSTRUMENT_NOTE_COUNT));
        assert_eq!(limits["batchMs"], u64::from(INSTRUMENT_BATCH_MS));
        assert_eq!(
            limits["maxEventsPerBatch"],
            MAX_INSTRUMENT_EVENTS_PER_BATCH as u64
        );
        assert_eq!(
            limits["audibleRadiusMeters"].as_f64().unwrap() as f32,
            INSTRUMENT_AUDIBLE_RADIUS
        );
        assert_eq!(
            limits["batchesPerSecond"].as_f64().unwrap() as f32,
            INSTRUMENT_BATCHES_PER_SEC
        );
        assert_eq!(
            limits["batchBurst"].as_f64().unwrap() as f32,
            INSTRUMENT_BATCH_BURST
        );
    }
}
