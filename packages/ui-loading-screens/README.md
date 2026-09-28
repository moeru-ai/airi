# @proj-airi/ui-loading-screens

This package provides loading screens for AIRI apps. [View the playground](https://proj-airi-packages-ui-loading-screens.netlify.app/).

## Use

Import `StartupScreen` from `@proj-airi/ui-loading-screens/startup-screen`. Give it the current phase, a progress value from 0 to 100, a logo URL, and a translated label.

```vue
<StartupScreen phase="loading" :progress="50" logo-src="/favicon.svg" :label="t('stage.operations.load-models-status.loading')" />
```

The `splash` phase shows the logo. The `loading` phase reveals a progress bar. The `done` phase removes the screen.
The screen uses Comfortaa and the `Progress` component from `@proj-airi/ui`.
The `hidden` event fires after the exit transition. Stage apps handle it through `StartupScreenProvider` to open onboarding.
Set `instant-exit` when the next full-screen view must appear in the same frame.

## When to use it

Use `StartupScreen` while an app waits for the startup tasks that it tracks. Report progress from completed tasks.

## When not to use it

Do not use startup progress for downloads without completion signals. Show a separate loading state for later model changes.

## License

[MIT](../../LICENSE)
