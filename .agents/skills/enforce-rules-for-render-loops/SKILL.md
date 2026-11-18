---
name: enforce-rules-for-render-loops
description: Enforce AIRI's rules for time in render loops. Use when you write or review motion, reaction, animation, spring, or effect code that a Pixi (Live2D), TresJS (VRM), or Three (MMD) frame loop samples, or when an event outside the loop starts an effect that a frame then plays.
---

# Enforce Rules for Render Loops

A render loop has its own clock. Code that a frame samples must read time from that clock only.

## Find the clock

| Renderer | Clock | Unit |
| --- | --- | --- |
| Live2D (`stage-ui-live2d`) | `ctx.now` of a motion manager plugin. It comes from `Live2DModel.elapsedTime`. `Model.vue` keeps the time of the last frame in `lastUpdateTime`. | Seconds. `Cubism4InternalModel.update` runs `now /= 1e3` before `motionManager.update`. |
| VRM (`stage-ui-three`) | `onBeforeRender(({ delta, elapsed }) => ...)` of TresJS `useLoop()` | Seconds |
| MMD (`stage-ui-mmd`) | The `Clock` of the scene, `clock.getDelta()` | Seconds |

## Rules

- Do not mix the frame clock with `performance.now()` or `Date.now()` in values that a frame samples.
  - A frame clock adds the time of each frame, and it falls behind the wall clock:
    - The Pixi ticker counts at most 100 ms for one frame (`Ticker._maxElapsedMS`).
    - A hidden tab pauses `requestAnimationFrame`.
    - A paused stage stops the ticker.
  - The difference grows during a session. It can be several seconds.
- An event from outside the loop, for example a pointer event, a store change, or a speech bus event, starts its effect at the frame time of the last frame. Alternatively, it queues the effect for the next frame.
  - Do not give it a `performance.now()` timestamp.
  - Example: `Model.react()` triggers the touch reaction at `lastUpdateTime`, the clock of `useMotionUpdatePluginTouchReaction`.
- Use `performance.now()` only to measure durations for traces and logs, never as animation input.
- Name the unit in each time name: `atMs`, `elapsedSeconds`, `durationMs`. Convert once, at the boundary.
- Bound the delta in springs and integrators. A delta can be 0 on the first frame and large after a stall. See `createLive2DMotionSpring`, which splits a step into substeps and clamps the total.

## Tests

- Write time-based logic as functions of explicit time inputs, for example `sample(nowSeconds)`, and test them with chosen times.
- A test for an effect that one clock starts and another clock samples must use both clocks as the runtime does. A test that triggers and samples with the same clock cannot find a clock mismatch.
- For runtime checks, sample the value that the frame renders, on the frame clock, for example `touchReaction.sample(lastUpdateTime)`. Also report the difference between the frame clock and the wall clock.
