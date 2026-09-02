<script lang="ts">
  import {
    INSTRUMENT_AUDIBLE_RADIUS,
    PlaylistQuietTracker,
    RemoteInstrumentPlayer,
    instrumentDistanceGain,
    isValidInstrumentBatch,
    setInstrumentMasterVolume,
    setInstrumentMuted,
    toWireEvents,
    type InstrumentNoteEvent,
    type InstrumentNoteWireEvent,
  } from '@live-instrument/core'
  import { InstrumentPanel } from '@live-instrument/ui-svelte'

  // A loopback "server": every batch the local player sends is validated,
  // delayed like a network hop and replayed as a second performer standing
  // `listenerDistance` metres away. What you hear twice is what a nearby
  // player would hear once.
  const ECHO_PERFORMER = 'echo'
  const NETWORK_DELAY_MS = 120

  let open = $state(false)
  let volume = $state(0.8)
  let muted = $state(false)
  let echoEnabled = $state(true)
  let listenerDistance = $state(8)
  let batchesSent = $state(0)
  let batchesRejected = $state(0)
  let lastBatch = $state<InstrumentNoteWireEvent[]>([])
  let playlistState = $state<'playing' | 'yielded'>('playing')
  let log = $state<string[]>([])

  const remote = new RemoteInstrumentPlayer()
  const quiet = new PlaylistQuietTracker(
    {
      onEnter: () => (playlistState = 'yielded'),
      onLeave: () => (playlistState = 'playing'),
    },
    { holdMs: 4000 }
  )

  const echoGain = () => instrumentDistanceGain(listenerDistance)

  function pushLog(line: string) {
    log = [line, ...log].slice(0, 8)
  }

  function onNotes(events: readonly InstrumentNoteEvent[]) {
    const wire = toWireEvents(events)
    if (!isValidInstrumentBatch(wire)) {
      batchesRejected += 1
      pushLog(`rejected batch of ${wire.length}`)
      return
    }
    batchesSent += 1
    lastBatch = wire
    pushLog(
      `#${batchesSent} ${wire.map((e) => `${e.note}@${e.offset_ms}`).join(' ')}`
    )
    if (!echoEnabled) return
    setTimeout(() => {
      remote.play(ECHO_PERFORMER, wire, echoGain, () => quiet.hold('heard'))
    }, NETWORK_DELAY_MS)
  }

  function start() {
    open = true
    quiet.set('panel', true)
  }

  function stop() {
    open = false
    quiet.set('panel', false)
    remote.stop(ECHO_PERFORMER)
  }

  $effect(() => setInstrumentMasterVolume(volume))
  $effect(() => setInstrumentMuted(muted))
</script>

<main>
  <header>
    <h1>Live Instrument Kit</h1>
    <p>
      Demo stage for the free-play mandolin. Open the panel and play with
      <kbd>Q</kbd>–<kbd>I</kbd>, <kbd>A</kbd>–<kbd>J</kbd>, <kbd>Z</kbd>–<kbd
        >M</kbd
      >. Each batch you send comes back through a loopback relay as a second
      performer at the chosen distance.
    </p>
  </header>

  <section class="controls">
    <button class="primary" onclick={open ? stop : start}>
      {open ? 'Stop performance' : 'Play instrument'}
    </button>

    <label>
      Volume <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        bind:value={volume}
      />
      <span>{Math.round(volume * 100)}%</span>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={muted} /> Mute
    </label>

    <label class="check">
      <input type="checkbox" bind:checked={echoEnabled} /> Loopback listener
    </label>
    <label>
      Listener distance
      <input
        type="range"
        min="0"
        max={INSTRUMENT_AUDIBLE_RADIUS + 2}
        step="0.5"
        bind:value={listenerDistance}
      />
      <span>{listenerDistance.toFixed(1)} m · gain {echoGain().toFixed(3)}</span
      >
    </label>
  </section>

  <section class="status">
    <div>
      <strong>Playlist BGM</strong>
      <span class:yielded={playlistState === 'yielded'}>{playlistState}</span>
    </div>
    <div><strong>Batches sent</strong> <span>{batchesSent}</span></div>
    <div><strong>Rejected</strong> <span>{batchesRejected}</span></div>
    <div>
      <strong>Last batch</strong>
      <code>{JSON.stringify(lastBatch)}</code>
    </div>
  </section>

  <section class="log">
    {#each log as line (line)}
      <div>{line}</div>
    {/each}
  </section>
</main>

<InstrumentPanel {open} performerId="local" {onNotes} onStop={stop} />

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 50% 0%, #22343a, transparent 60%),
      linear-gradient(180deg, #0b1416 0%, #050a0b 100%);
    color: #f1e8d2;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 20px 360px;
  }

  h1 {
    margin: 0 0 8px;
    font-family: Georgia, serif;
    font-weight: 500;
    letter-spacing: 0.03em;
  }

  header p {
    color: rgba(241, 232, 210, 0.75);
    line-height: 1.5;
  }

  kbd {
    padding: 1px 5px;
    border: 1px solid rgba(239, 222, 183, 0.4);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 24px;
    margin-top: 20px;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .controls span {
    min-width: 40px;
    color: rgba(124, 248, 215, 0.85);
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }

  .primary {
    padding: 10px 18px;
    border: 1px solid rgba(111, 255, 218, 0.6);
    border-radius: 999px;
    background: rgba(55, 133, 113, 0.25);
    color: #e8fff8;
    font: inherit;
    cursor: pointer;
  }

  .primary:hover {
    background: rgba(55, 133, 113, 0.45);
  }

  .status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-top: 24px;
    padding: 14px 16px;
    border: 1px solid rgba(226, 190, 118, 0.25);
    border-radius: 12px;
    background: rgba(5, 10, 12, 0.6);
    font-size: 13px;
  }

  .status strong {
    display: block;
    margin-bottom: 4px;
    color: rgba(241, 232, 210, 0.6);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .status span {
    color: #7cf8d7;
    font-family: 'Courier New', monospace;
  }

  .status span.yielded {
    color: #f6ca79;
  }

  .status code {
    display: block;
    overflow-wrap: anywhere;
    color: rgba(241, 232, 210, 0.8);
    font-size: 11px;
  }

  .log {
    margin-top: 12px;
    color: rgba(241, 232, 210, 0.55);
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.6;
  }
</style>
