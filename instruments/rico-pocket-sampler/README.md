# Rico's Pocket Sampler  (excited edition)

A simplified, Koala-style sampler in a single vanilla HTML/CSS/JS app. No build
step, no dependencies — just the Web Audio API.

## Features

- **8 sound pads** — tap to play and select. Ships with a built-in synthesized
  drum kit so it's playable instantly. Also trigger with your keyboard:
  `A S D F G H J K` = pads 1–8. Each pad has **M** (mute) and **S** (solo) chips
  to shape the mix — mute kills a pad, solo lets only that pad through (exclusive).
- **Sampling** — record from the mic (`Record`) or import any audio file
  (`Load Audio`). New audio lands on the currently selected pad.
- **Per-pad flavor** — select a pad, then drag **PITCH** (−12…+12 semitones) to
  transpose it (chipmunk / baritone) or hit **Reverse** to play it backwards.
- **Waveform editor + chopping** — drag the gold handles to set a start/end
  region, `Play` to audition it, `Apply Trim` to bake the region into the pad,
  or `Chop -> 8 Pads` to slice the selection into 8 equal hits across the kit.
- **Effects bus** — everything routes through a live send/return chain:
  - **Drive** — soft-clipping saturation (turn it up for grit).
  - **Tone** — a low-pass filter (close it for a mellow, lo-fi feel).
  - **Delay** — a synced-feel echo send.
  - **Space** — a generated convolution reverb for room / ambience.
  - **Volume** — master level, with a live output **meter**.
- **16-step sequencer** — one row per pad, adjustable BPM (60-180), with a
  look-ahead scheduler for tight timing. Comes seeded with a starter beat.
- **Pattern bank** — four save slots (`Pattern` row). Hit **Save** to stash the
  current grid into the selected slot, click a slot to load it back, and
  **Clear** to erase the selected slot. Patterns persist across reloads via
  `localStorage`.
- **Choke groups** — the open hat cuts the closed hat, like a real drum machine.
  Mute/solo and pattern switching both apply live while the loop plays.

## Run it

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
```

Microphone recording requires `https://` or `localhost`.

## Files

| File         | Purpose                                             |
| ------------ | --------------------------------------------------- |
| `index.html` | Layout: pads, editor, FX, sequencer                 |
| `style.css`  | All styling (dark + gold theme)                     |
| `game.js`    | Audio engine, chopping, FX bus, sequencer           |

## Integrating into your own `game.js`

Everything is wrapped in an IIFE with state on the `S` object. The reusable
pieces:

- **`makeKit()` / `renderTone()`** — procedural drum synthesis; swap for your
  own decoded `AudioBuffer`s by calling `setPad(i, buffer, name, opts)`.
- **The FX bus** — `buildFX()` wires pads → drive → filter → delay/verb sends →
  master → analyser. `applyFx()` recomputes node params from `S.fx`.
- **`playPad(i, t, flash)`** — the core play routine (pitch, reverse, choke);
  both live triggers and the sequencer route through it.
- **`chopToPads()`** — slices the selected region into `PAD_COUNT` equal buffers.
- **`applyTrim()`** — bakes a start/end region into a shorter buffer.
- **Look-ahead scheduler** — `scheduler()` / `scheduleStep()` drive the
  sequencer with sample-accurate `src.start(time, ...)` scheduling.

A small global API is exposed for external triggering:

```js
RicoSampler.trigger(0);            // play pad 1
RicoSampler.loadKit();             // reload the built-in kit
RicoSampler.setFx({drive:0.5, space:0.3}); // tweak the bus live
RicoSampler.state;                 // full internal state (pads, seq, fx, ...)
```

The FX chain runs through the master bus, so anything that plays — pads,
recordings, the sequencer, even the editor preview — is affected by Drive,
Tone, Delay, and Space at once.