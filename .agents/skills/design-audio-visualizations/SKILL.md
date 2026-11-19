---
name: design-audio-visualizations
description: Design and build AIRI visuals that react to audio, for example a microphone check, a voice wave, a level meter, or a speaking glow. Use when UI motion follows a microphone or a playback, or when such a visual flickers, lags, or feels stiff.
---

# Design Audio Visualizations

A good audio visual is still in a quiet room, follows the voice at once, and moves with weight. Each layer of the
pipeline below does one of these jobs. Do not let one layer do the job of another.

| Layer | Job | Where in AIRI |
| --- | --- | --- |
| Signal | Read the audio through a pipeline seam | `observeLevel`, `observeSpectrum` in `packages/pipelines-audio` |
| Estimate | Make each reading stable enough to show | Window averaging in `observeSpectrum` |
| Noise | Turn the background into 0 | `VoiceBandGate` in `packages/stage-ui/src/libs/voice/band-gate.ts` |
| Motion | Move between readings with speed and weight | A damped spring in the frame loop |
| Visual | Draw layers that suit the motion | SVG shapes, CSS, `ProgressiveBlur` |

The reference is the microphone page of the onboarding permissions step:
`packages/stage-ui/src/components/scenarios/permissions/microphone-voice-visual.vue`.

## Signal: use a pipeline seam

- Read audio through `observeLevel` (one level) or `observeSpectrum` (one level for each band). Both take an `AudioInput`.
- Do not add a Web Audio tap or an `AnalyserNode` in a component. A local tap splits the audio graph.
- If a visual needs a new reading, add a seam to `packages/pipelines-audio` next to `observeSpectrum`, with tests.
- Run an observation only while the visual is shown. It keeps the source open.
- Levels are 0 to 1, linear in decibels. `observeLevel` maps -60 dBFS to full scale. `observeSpectrum` maps -80 dB to -20 dB.
- `voiceBands` has four bands: 80–300 Hz, 300–1000 Hz, 1–3 kHz, and 3–8 kHz. They are the fundamental, the low and high formants, and the sibilants.

## Estimate: average windows before decibels

The power of one FFT window of noise varies about as much as its mean. A longer window does not reduce this variation.
So a visual of single windows flickers, even in a quiet room.

- Average the power of the last K windows, then convert to decibels (the Welch method). The variation falls by about 1/√K.
- Each window adds one hop of delay. With 33 ms hops, K = 2 adds about 33 ms. K = 4 adds about 100 ms and feels stiff.
- Average power, not decibels. An average of decibels gives a wrong level for noise.
- Start the average again after a gap in the audio (`window.discontinuity`).

## Noise: an adaptive floor and a gate

A fixed threshold fails: a band whose room noise is near the threshold switches on and off, and it looks like a flicker.
Use `VoiceBandGate` for each band. It does four things:

1. It tracks a noise floor. The floor follows a quieter level fast (time constant 0.25 s). It rises toward a louder level at most 0.02 per second (about 1.2 dB/s). Steady noise, for example a fan, becomes part of the floor in a few seconds. Speech comes in bursts, so the floor stays below it.
2. A gate with hysteresis opens 7 dB above the floor and closes 3 dB above it. A level near one threshold does not switch the gate.
3. The gate opens only after 60 ms above the threshold. A key click is shorter. A syllable is much longer.
4. A smoothstep shapes the output, so small changes just above the floor stay small.

- Feed the gate the time of the audio, for example one spectrum hop. Do not use the frame time.
- Reset the gate when the input device changes. A new device has a new background.
- Keep the gate outside the visual. The visual receives "how much a voice stands out", from 0 to 1.

## Motion: springs, not tweens

A band level changes about 30 times a second. A tween that a new target restarts begins from rest each time. It never
carries speed, so it only creeps after the level. This is true for `createAnimatable` of anime.js, with or without a
spring ease.

- Integrate a damped spring on each frame: `acceleration = (stiffness × (target − position) − damping × velocity) / mass`.
- Derive the damping from a damping ratio: `damping = 2 × ratio × √(stiffness × mass)`. A ratio of 1 settles without a swing. A lower ratio swings past the target.
- Read time only from the frame delta. Cap one frame at 50 ms, and split it into steps of at most 1/120 s. Also see the `enforce-rules-for-render-loops` skill.
- Smooth in one place only. If the spring smooths, the composable passes raw levels. Two smoothing stages add their delays.
- Keep continuous motion, for example the phase of a wave, as a separate value that grows with the frame time. It has no target.

Give each layer its own height and inertia, so one band never fills the panel. The low band carries the body of the voice:

| Band | Max height | Stiffness | Mass | Damping ratio | Peak (time, overshoot) |
| --- | --- | --- | --- | --- | --- |
| 80–300 Hz | 1.0 | 260 | 1.6 | 0.55 | 283 ms, 11% |
| 300–1000 Hz | 0.8 | 420 | 1.2 | 0.48 | 183 ms, 15% |
| 1–3 kHz | 0.6 | 650 | 0.9 | 0.42 | 117 ms, 20% |
| 3–8 kHz | 0.4 | 900 | 0.7 | 0.36 | 83 ms, 24% |

To tune the feel:

- For more bounce, lower the damping ratio.
- For a faster layer, raise the stiffness.
- For a heavier layer, raise the mass.
- Before you change a value, simulate the step response (time to peak, overshoot, settle time), and report the numbers.

## Visual: layers, not ornaments

- Draw one layer for each band, from back to front. Each layer is a filled shape, mirrored around the middle line.
- Taper each shape to nothing at both ends (`sin(πx)²`). Then add a `ProgressiveBlur` at the `left` and `right` edges, so the ends dissolve into the panel.
- Give the layers different wave lengths and phase speeds: a low band swells slowly, and a high band ripples fast. Overlap them with fill opacities of about 0.3 to 0.45.
- Use primary shades only, so the visual follows the theme color. In dark mode, use shades two steps lighter than in light mode. Dark shades disappear on a dark panel.
- Keep a small rest height (about 0.05) while the microphone listens, so the user sees that it listens. Before access, draw thin gray lines.
- Do not add outlines, rings, shadows, or a big check disc. A result belongs in the text next to the visual.
- Do not leave a halo behind a core at scale 1. Its edge shows as a ring. Start it inside the core.

## Test and calibrate

- Test a seam with synthetic audio: a sine in each band, silence, and white noise from a fixed seed.
- Test a gate with explicit times: noise that jitters near the floor stays 0, a voice opens it, a one-hop click stays 0, and steady louder noise joins the floor.
- Calibrate in the running app, not only in tests. Read the values on the frame clock over CDP, for example the drawn heights and the band levels, at about 100 ms intervals.
- A forced prop value in the running app competes with the real updates. Use a step simulation for exact motion numbers.
- Check light and dark mode, and a quiet and a loud room.

## Pitfalls that this design met

- A comment before the root element of a page component makes the root a fragment in dev builds. A `<Transition mode="out-in">` then stops, and the next page never renders. Put comments inside the root element.
- Smoothing in the composable and again in the visual made the motion slow. Keep one smoothing stage.
- An average of 4 windows, a 140 ms tween, and a smoothstep together felt stiff. Each stage adds delay or flattens the peaks.
