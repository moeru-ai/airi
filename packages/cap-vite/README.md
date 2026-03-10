# @proj-airi/cap-vite

CLI for [Capacitor](https://capacitorjs.com/) live-reload development using Vite.

## Usage

```bash
pnpm cap-vite -- ios --target <DEVICE_ID_OR_SIMULATOR_NAME>
pnpm cap-vite -- android --target <DEVICE_ID_OR_SIMULATOR_NAME>
# Or
CAPACITOR_DEVICE_ID=<DEVICE_ID_OR_SIMULATOR_NAME> pnpm cap-vite ios
CAPACITOR_DEVICE_ID=<DEVICE_ID_OR_SIMULATOR_NAME> pnpm cap-vite android
```

- Arguments after `--` are forwarded to `cap run`, example: `pnpm cap-vite -- ios --target <DEVICE_ID_OR_SIMULATOR_NAME> --scheme AIRI` will run `cap run ios --target <DEVICE_ID_OR_SIMULATOR_NAME> --scheme AIRI`.

You can see the list of available devices and simulators by running `pnpm exec cap run ios --list` or `pnpm exec cap run android --list`.

## Capacitor Configuration

You need to set `server.url` in `capacitor.config.ts` to the env variable `CAPACITOR_DEV_SERVER_URL`, then the cli will handle rest for you.

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

## Why we need this?

- No need to care what `server.url` should be, it will be automatically set to the correct value.
- Rerun native app when native code changes, you won't forget to start it.
- No need to open two terminals to run the project, you can run it with one command.

## But, why the code looks so ugly?

- We need to pass arguments to `vite`, and we don't want to repeat the argument list, so `createServer` cannot be used.
- Parse server urls from outputs of `vite` is not stable, so we use the plugin to get the server url.
- We don't want to touch the config file of users, so we inject the plugin instead.
- Vite cli cannot pass arguments to the plugin, so we catch the arguments and pass them to the plugin.
