# @proj-airi/cap-vite

CLI for [Capacitor](https://capacitorjs.com/) live-reload development using Vite.

## Usage

```bash
pnpm cap-vite ios --target <DEVICE_ID_OR_SIMULATOR_NAME>
pnpm cap-vite android --target <DEVICE_ID_OR_SIMULATOR_NAME>
pnpm cap-vite ios --target <DEVICE_ID_OR_SIMULATOR_NAME> -- --scheme AIRI
pnpm cap-vite android --target <DEVICE_ID_OR_SIMULATOR_NAME> -- --flavor release
# Or
CAPACITOR_DEVICE_ID=<DEVICE_ID_OR_SIMULATOR_NAME> pnpm cap-vite ios
CAPACITOR_DEVICE_ID=<DEVICE_ID_OR_SIMULATOR_NAME> pnpm cap-vite android
```

- Arguments after `--` are forwarded to `cap run`, example: `pnpm cap-vite ios --target <DEVICE_ID_OR_SIMULATOR_NAME> -- --scheme AIRI` will run `cap run ios --target <DEVICE_ID_OR_SIMULATOR_NAME> --scheme AIRI`.

You can see the list of available devices and simulators by running `pnpm exec cap run ios --list` or `pnpm exec cap run android --list`.

## Capacitor Configuration

You need to set `server.url` in `capacitor.config.ts` to the env variable `CAPACITOR_DEV_SERVER_URL`.

```ts
const serverURL = env.CAPACITOR_DEV_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'Example App',
  webDir: 'dist',
  server: serverURL
    ? {
        url: serverURL,
        cleartext: false,
      }
    : undefined,
}

export default config
```

## What It Does

- Starts the project's own Vite config through the Vite API.
- Executes the local `cap` binary via `tinyexec`.
- Watches native files under `ios/` or `android/` and re-runs `cap run` after a small debounce.
