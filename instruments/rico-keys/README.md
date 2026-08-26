# Rico's Keys

A standalone touchscreen piano built with the Web Audio API. No audio files, no
build step, no dependencies — just open `index.html`.

## Files

- `index.html` — layout: controls bar + responsive keyboard
- `style.css` — dark/gold theme, white/black key styling
- `game.js` — the synth engine, keyboard builder, and input handling
- `README.md` — this file

## Run it

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
```

Audio starts on first interaction (browser autoplay policy), so tap a key or the
hint button to begin.

## Playing

- **Touch / mouse:** tap keys. Slide across the keyboard to glissando (notes
  hand off as your finger moves).
- **Multi-touch:** each finger is tracked independently, so chords work.
- **Computer keyboard:** `A S D F G H J K L` = white keys, `W E T Y U O P` =
  black keys, `Z` / `X` = octave down / up.

## Controls

- **Voice** — 6 synthesized presets (Rhodes, Soft Tri, Bright Saw, Square, Pure
  Sine, Organ).
- **Octave** — shift the two-octave keyboard from octave 1–7.
- **Transpose** — shift pitch in semitones (±11) without moving the keys; useful
  to play a melody in a different key or follow a singer. The `0` button resets.
- **Volume** — master gain.
- **Sustain** — hold notes after release until toggled off.
- **Labels** — show/hide note names.

## Persistence

Your voice, octave, transpose, volume, sustain, and labels are saved to
`localStorage` and restored the next time you open the page — nothing to
configure.

## Spectrum

A live frequency analyzer (from an `AnalyserNode` on the master bus) draws
color-coded bars above the keyboard so you can watch the timbre of each voice
in real time.

## Recorder

- **Record** — tap to start, tap again (or the button turns to *Stop*) to finish.
- **Play** — replays the captured performance on the synth with live key feedback and the sustain pedal.
- **WAV** — exports the actual audio you played (the master bus) as a downloadable `.wav` file.
- **Clear** — wipes the current recording.

The recorder captures the real-time audio output, so anything you play (notes, chords,
glissando, sustain) is what ends up in the WAV file. Note events are also stored, letting
Play re-perform the take through the synth engine. A red pulsing dot indicates recording.

The recorder is exposed for programmatic use: `RicoKeys.recorder.toggle()`, `.play()`,
`.clear()`, and `.exportWav()`.

## How the sound works

Each note is additive: a preset defines a set of harmonic partials (frequency
multiplier + amplitude) plus an ADSR envelope. `noteOn(midi)` builds the
oscillators and ramps the gain up; `noteOff(midi)` ramps down over the release
time. A `DynamicsCompressor` on the master bus keeps chords from clipping.

## Embedding into your own game.js

The engine exposes a small global API so you can drive it from your own code:

```js
RicoKeys.noteOn(60);        // middle C
RicoKeys.noteOff(60);
RicoKeys.setVoice("organ"); // switch preset
RicoKeys.setOctave(5);
RicoKeys.setVolume(0.5);    // 0..1
RicoKeys.midiToFreq(69);    // 440
RicoKeys.state;             // live state object
```

The reusable core to lift is `noteOn` / `noteOff` (the additive-synth voice with
ADSR), the `VOICES` preset table, and `buildKeyboard()` if you want the visual
keyboard. To use real samples instead of oscillators, replace the oscillator
creation inside `noteOn` with an `AudioBufferSourceNode` playing your decoded
buffer at `midiToFreq(midi)` via `playbackRate`.
