# Integration guide

The kit is consumed as source. Copy `packages/core` and `packages/ui-svelte`
into your client (or reference them as workspace packages), and add
`packages/server-rust` to your Cargo workspace. Nothing needs a build step
beyond your bundler and compiler.

## Client

### 1. Mount the panel

```svelte
<script lang="ts">
  import { InstrumentPanel } from '@live-instrument/ui-svelte'
  import { toWireEvents } from '@live-instrument/core'

  let open = $state(false)
</script>

<InstrumentPanel
  {open}
  performerId={myPlayerId}
  onNotes={(events) =>
    socket.send({ InstrumentNotes: { events: toWireEvents(events) } })}
  onStop={() => {
    socket.send('StopInteraction')
    open = false
  }}
/>
```

Props:

| Prop                         | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `open`                       | Host-owned visibility. Set it when the server confirms the start.        |
| `performerId`                | Keys the local voices in the shared pool (defaults to a local sentinel). |
| `onNotes(events)`            | A finished 250 ms batch; send it.                                        |
| `onStop()`                   | Escape or the close button; tell the server and set `open = false`.      |
| `onPressedChange(set)`       | Optional mirror of pressed notes (e.g. to animate a hand).               |
| `title` `subtitle` `eyebrow` | Header copy; defaults to the mandolin skin.                              |
| `ornamentSrc`                | Header artwork URL, `null` to hide. Defaults to the bundled ornament.    |
| `claimKey(event)`            | Return `false` to leave a key to the host (e.g. a chat toggle).          |

While open, the panel captures its 22 keys and Escape in the capture phase
and stops propagation, so the host's movement handler never sees them. The
host should still:

- ignore canvas clicks and camera controls while `open` is true;
- clear any held movement keys when the panel opens (a key held through the
  transition otherwise keeps moving the character);
- register the panel in its overlay/Escape stack with `onStop` as the closer.

If the host keeps HUD flags in Svelte stores, `instrumentPanelVisible`,
`openInstrumentPanel` and `closeInstrumentPanel` from `ui-svelte` are a
ready-made flag with a visibility hook.

### 2. Start flow

Send a start request (`StartInstrument`) and open the panel only when the
server confirms (`PlayerInstrumentStarted` for your own id). The server may
refuse: no instrument, dead, not ready. The same broadcast tells nearby
clients to prepare for a performer; drop any previous voices for that id.

### 3. Remote playback

```ts
import {
  RemoteInstrumentPlayer,
  instrumentDistanceGain,
  PlaylistQuietTracker,
} from '@live-instrument/core'

const remote = new RemoteInstrumentPlayer()
const quiet = new PlaylistQuietTracker({
  onEnter: () => bgm.fadeOut(),
  onLeave: () => bgm.resume(),
})

function onPlayerInstrumentNotes(msg) {
  if (msg.player_id === myPlayerId) return
  remote.play(
    msg.player_id,
    msg.events,
    () => {
      if (msg.floor_level !== myFloor()) return 0
      return instrumentDistanceGain(distanceTo(msg.position))
    },
    () => quiet.hold('heard')
  )
}
```

Resolve gain from the position snapshot the server attached, not from the
performer entity, so a batch still plays correctly if the performer is
briefly out of the interest set. Call `remote.stop(id)` on `PlayerLeft`,
`PlayerDisappeared`, `PlayerDead`, respawn, a `/play_music` start and any
interaction change away from the performing pose; `remote.stopAll()` on kick
or scene reset.

### 4. Volume and BGM

Wire the game's SFX setting to `setInstrumentMasterVolume` / `setInstrumentMuted`.
Call `quiet.set('panel', open)` around the local panel; the BGM player fades
on `onEnter` and resumes on `onLeave`. Give `/play_music`-style performances
and battle music a higher rank than the tracker if your game has them.

## Server (Rust)

```rust
use live_instrument::{
    valid_instrument_batch, should_hear, InstrumentBatchLimiter, InstrumentNoteEvent,
    LivePerformers, INSTRUMENT_AUDIBLE_RADIUS,
};
```

Per connection: `InstrumentBatchLimiter::new()`. Per world: `LivePerformers<PlayerId>`
behind your player-state lock.

Message handling in the reference integration:

1. `StartInstrument` — check the player holds an instrument, is alive and
   ready; cancel other concentration (fishing, cooking); `performers.start(id)`;
   if it returned `true`, set the performing pose and broadcast
   `PlayerInstrumentStarted { player_id }` to players within
   `INSTRUMENT_AUDIBLE_RADIUS` on the same floor.
2. `InstrumentNotes { events }` — `limiter.allow()` first, then
   `valid_instrument_batch(&events)`, then `performers.is_live(&id)`; re-check
   the instrument (drop the session if it is gone); snapshot the performer's
   position, floor and name; collect listeners with `should_hear` (same floor,
   within radius, not the performer, not anyone whose block list names the
   performer); send `PlayerInstrumentNotes { player_id, position, floor_level, events }`
   once, encoded once, to all of them.
3. Ending — call `performers.stop(&id)` from every path that should end a
   performance; when it returns `true`, clear the pose so clients stop the
   voices. The reference list: movement, attack, taking a hit, death,
   equipment change, trade accepted, `StopInteraction`, disconnect, starting
   a scripted `/play_music` performance.

Keep the lock discipline: if `LivePerformers` sits inside a `tokio::sync::RwLock`,
drop the guard before calling anything that takes the same lock.

## Servers in other languages

Port `valid_instrument_batch` (mirrored in `core` as `isValidInstrumentBatch`),
the token bucket (4 per second, burst 4) and the hearing rule. The constants
to keep identical on both sides are 22 notes, 250 ms window, 16 notes per
batch and 30 m radius.

## Protocol notes

Adding the two client messages and two server messages is a wire-format
change. If your protocol has a version handshake, bump it.
