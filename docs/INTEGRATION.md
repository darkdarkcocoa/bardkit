# Integration guide

Install the client halves from npm and add the crate to your Cargo workspace:

```bash
npm install bardkit-core bardkit-ui-svelte
```

```toml
[dependencies]
bardkit = "0.1"
```

`bardkit-core` ships compiled JavaScript with type declarations, so it needs
nothing from your build beyond an ES module bundler. `bardkit-ui-svelte`
ships Svelte components as source, the Svelte convention, so your bundler
needs the Svelte plugin you already have. Copying the package folders into
your own tree still works if you would rather vendor them.

## Client

### 1. Mount the panel

```svelte
<script lang="ts">
  import { InstrumentPanel } from 'bardkit-ui-svelte'
  import { toWireEvents } from 'bardkit-core'

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
| `title` `subtitle` `eyebrow` | Header copy; defaults to the lute skin.                                  |
| `ornamentSrc`                | Header artwork URL, `null` to hide. Defaults to the bundled ornament.    |
| `claimKey(event)`            | Return `false` to leave a key to the host (e.g. a chat toggle).          |

Those props cover the copy and the artwork; the rest of the skin is meant to
be edited, not configured. The per-register accent colors, the panel's scoped
CSS, the three key rows and the solfege labels all live in
`InstrumentPanel.svelte`, the note table lives in `core/src/notes.ts`, and the
voice lives in `core/src/audio.ts`. Because the kit is consumed as source,
reskinning it means changing those files in your copy.

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
refuse: no instrument, dead, not ready. Nearby clients use the same broadcast
to get ready: drop any voices still playing for that id and call
`quiet.hold('heard')` immediately, so the playlist has already faded by the
time the first batch lands. Order matters if the game also has scripted
songs: lower the playlist first, then stop the song, because a stop handler
that resumes the playlist would otherwise bring it back under the live
session.

### 3. Remote playback

```ts
import {
  RemoteInstrumentPlayer,
  instrumentDistanceGain,
  PlaylistQuietTracker,
} from 'bardkit-core'

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
use bardkit::{
    valid_instrument_batch, should_hear, InstrumentBatchLimiter, InstrumentNoteEvent,
    LivePerformers, INSTRUMENT_AUDIBLE_RADIUS,
};
```

Per connection: `InstrumentBatchLimiter::new()`. Per world: `LivePerformers<PlayerId>`
behind your player-state lock.

Message handling in the reference integration:

1. `StartInstrument` — check the player holds an instrument, is alive and
   ready, and cancel other concentration (fishing, cooking). Clear any
   pending click-to-move as well: a queued walk would end the session on the
   very next movement tick. Then `performers.start(id)`; if it returned
   `true`, set the performing pose and broadcast
   `PlayerInstrumentStarted { player_id }`. Use the radius your other
   performance events already use, even when it exceeds
   `INSTRUMENT_AUDIBLE_RADIUS`: a listener out at the edge may still be
   hearing this player's scripted song and needs to know it stopped. Once
   the broadcasts are out, confirm `performers.is_live(&id)` one more time.
   A hit, a trade or a move tick can cancel the session in between and clear
   the pose; if the pose broadcast is the last message the client sees, it
   keeps an empty panel open.
2. `InstrumentNotes { events }` — `limiter.allow()` first, then
   `valid_instrument_batch(&events)`, then `performers.is_live(&id)`; re-check
   the instrument (drop the session if it is gone); snapshot the performer's
   position, floor and name; collect listeners with `should_hear` (same floor,
   within radius, not the performer, not anyone whose block list names the
   performer); send `PlayerInstrumentNotes { player_id, position, floor_level, events }`
   once, encoded once, to all of them.
3. Ending — call `performers.stop(&id)` from every path that should end a
   performance; when it returns `true`, clear the pose so clients stop the
   voices. The reference list: movement, attack, taking a hit, death, losing
   the instrument (dropped or sold), trade accepted, `StopInteraction`,
   disconnect, starting a scripted `/play_music` performance. Swapping gear
   is not on the list: as long as the instrument is still in the bag or in
   hand the session continues, and the ownership check runs again only when
   an item actually leaves the inventory.

Keep the lock discipline: if `LivePerformers` sits inside a `tokio::sync::RwLock`,
drop the guard before calling anything that takes the same lock.

Movement is the hot path: every move packet has to ask whether this player
is performing, and taking the registry's write lock for that question does
not scale. Keep a count of live performers beside the registry and return
early while it is zero; when it is not, check membership under a read lock
and take the write lock only to remove. Funnel every removal through a
single helper so the count and the set cannot disagree.

These session rules were learned while the kit ran inside
[OpenMMO](https://github.com/Julian-adv/OpenMMO), its first host.

## Servers in other languages

Port `valid_instrument_batch` (mirrored in `core` as `isValidInstrumentBatch`),
the token bucket (4 per second, burst 4) and the hearing rule. The numbers
both sides must agree on live in `packages/server-rust/limits.json`; read that
file at build time or copy it verbatim, and add a test like the Rust crate's
`constants_match_the_shared_limits_file` so a change on one side fails the
other side's build.

## Protocol notes

Adding the two client messages and two server messages is a wire-format
change. If your protocol has a version handshake, bump it.
