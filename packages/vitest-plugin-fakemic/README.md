# Vitest plugin for fake microphones

This package supplies fake-microphone Web and Electron runtimes with Vitest project integration.

Import the Vitest interface from the package root:

```ts
import fakemic, {
  createAudioTestAPI,
  electron,
  runAudioTestSession,
  web,
} from '@proj-airi/vitest-plugin-fakemic'
```

`src/index.ts` owns project configuration, runtime launch, task collection, and preflight scheduling. `src/runner.ts` owns task execution.

Runtime configuration contains only serializable values. A `prepare` module adapts the launched Playwright runtime into an application session.

```ts
fakemic({
  name: 'audio-web',
  include: ['cases/**/*.audio.test.ts', 'cases/**/*.audio.web.test.ts'],
  runtime: web({
    name: 'web',
    prepare: new URL('./prepare-web.ts', import.meta.url).href,
    url: 'http://127.0.0.1:4173/',
  }),
})
```

Application packages own selectors, routes, probes, Provider settings, and prepare modules.
