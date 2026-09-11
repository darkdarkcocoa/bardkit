# Asset provenance

Record every binary asset here with its source and license.

## UI

- `packages/ui-svelte/assets/instrument-ornament.webp` — OpenAI Codex
  built-in image generation (`codex exec`, workspace-provided tier), generated
  2026-09-12; project-owned generated asset. Source 2172×724 transparent PNG,
  cropped to the band and scaled to a 1600 px wide WebP. Decorative header
  artwork behind the panel title: an acoustic-guitar band with a rosette at
  the centre and a six-peg headstock at each end. As an AI-generated image it
  may not qualify for copyright protection; to the extent any rights exist,
  the project waives them (CC0 1.0), so the image may be used under either of
  the repository licenses or on its own.

## Audio

None. Every note is synthesized at runtime by `packages/core/src/audio.ts`
(Karplus–Strong plucked string plus a procedural room impulse). No recorded
samples or third-party sound libraries are used.

## Glyphs

The clef characters `𝄞` and `𝄢` and the `♪` strike marker are Unicode text
rendered by the viewer's fonts, not bundled glyph assets.
