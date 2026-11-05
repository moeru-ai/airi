<h1 align="center">アイリ VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Try it</a>]
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

## Performance diagnostics

Run `pnpm dev:web:https` from the repository root. Open `/devtools/performance-visualizer` and enable FPS.
The floating overlay shows the last 10 seconds of FPS history, with time and FPS axes.
The minimum, maximum, and latest values describe the visible samples. Other metrics retain their distribution charts.

Start a recording, then navigate within the app to the scene you want to measure.
Stop the recording within 60 seconds, or let it stop automatically.
Return to the visualizer to inspect the recorded FPS history. Export the recording as CSV for individual timestamps and values.

Each FPS sample is `1000 / frameIntervalMs`, from `requestAnimationFrame` callbacks.
Use these samples to locate changes in animation frame timing. They do not measure GPU presentation or native application FPS.
Keep the page in the foreground. Reloading the page clears the recording.

For device comparisons, use the same scene, model, warm-up period, and recording duration.
The development server and the visible overlay affect performance, so record these conditions with the results.

## Offline build

Set `VITE_AIRI_OFFLINE=true` for a machine without internet, for example the mirror of the Alice fork.

- The app sends no request to AIRI Cloud. Feature flags keep their local defaults.
- The fonts come from the local `@fontsource` packages, as in `stage-tamagotchi`. This is true for every build.
- Product analytics stay off, as in every build without `VITE_ENABLE_ANALYTICS`.

```sh
VITE_AIRI_OFFLINE=true pnpm -F @proj-airi/stage-web build
```

The first build downloads the Live2D SDK and the preset models into `.cache`. Later builds use the cache.
