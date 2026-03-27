# @proj-airi/cap-vite

CLI for [Capacitor](https://capacitorjs.com/) live-reload development using Vite.

## Usage

```bash
cap-vite [vite args...] -- <ios|android> [cap run args...]
```

Examples:

```bash
pnpm exec cap-vite -- ios --target <DEVICE_ID_OR_SIMULATOR_NAME>
pnpm exec cap-vite -- --host 0.0.0.0 --port 5173 -- android --target <DEVICE_ID_OR_SIMULATOR_NAME> --flavor release
CAPACITOR_DEVICE_ID_IOS=<DEVICE_ID_OR_SIMULATOR_NAME> pnpm exec cap-vite -- ios
pnpm -F @proj-airi/stage-pocket run dev:ios -- --target <DEVICE_ID_OR_SIMULATOR_NAME>
```

- Arguments before `--` are forwarded to `vite`.
- Arguments after `--` are forwarded to `cap run`.
- If the platform-specific env is set (`CAPACITOR_DEVICE_ID_IOS` or `CAPACITOR_DEVICE_ID_ANDROID`) and `cap run` args do not contain `--target`, `cap-vite` injects `--target` with that value automatically.
- `cap-vite` always launches the Vite dev server. Do not pass `vite dev` or `vite serve` as extra args.
- After the dev server starts, press `R` in the terminal to re-run `cap run` without restarting Vite.

You can see the list of available devices and simulators by running `pnpm exec cap run ios --list` or `pnpm exec cap run android --list`.

## Capacitor Configuration

You need to set `server.url` in `capacitor.config.ts` to the env variable `CAPACITOR_DEV_SERVER_URL`, then the cli will handle rest for you.

```ts
const serverURL = env.CAPACITOR_DEV_SERVER_URL
const isCleartext = serverURL?.startsWith('http://') ?? false

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'Example App',
  webDir: 'dist',
  server: serverURL
    ? {
        url: serverURL,
        cleartext: isCleartext,
      }
    : undefined,
}

export default config
```

## Why we need this?

- No need to care what `server.url` should be, it will be automatically set to the correct value.
- Rerun native app when native code changes, you won't forget to start it.
- Rerun `cap run` on demand from the same terminal when you need a clean native relaunch.
- No need to open two terminals to run the project, you can run it with one command.

## Architecture Notes

- Vite arguments are left to the real Vite CLI instead of being reimplemented inside `cap-vite`.
- `cap-vite` injects a wrapper config so it can append its own Vite plugin without editing the user's existing `vite.config.*`.
- The injected plugin reads `server.resolvedUrls`, starts `cap run`, and restarts it when files under the native platform directory change or when you press `R` in the terminal.
- `cap-vite` only splits the two argument groups and passes the `cap run` arguments into the injected plugin through environment variables.
