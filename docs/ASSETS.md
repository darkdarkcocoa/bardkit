# Asset provenance

Record every binary asset here with its source and license.

## UI

- `packages/ui-svelte/assets/mandolin-ornament.webp` (also copied to
  `examples/demo/public/`) — OpenAI Codex built-in ImageGen, workspace-provided
  tier (exact tier not exposed), generated 2026-08-30; project-owned generated
  asset. Source 1983×793 PNG, color-keyed, cropped and scaled to a transparent
  1600×323 WebP. Decorative header artwork behind the panel title.

## Audio

None. Every note is synthesized at runtime by `packages/core/src/audio.ts`
(Karplus–Strong plucked string plus a procedural room impulse). No recorded
samples or third-party sound libraries are used.

## Glyphs

The clef characters `𝄞` and `𝄢` and the `♪` strike marker are Unicode text
rendered by the viewer's fonts, not bundled glyph assets.
