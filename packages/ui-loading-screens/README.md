# @proj-airi/ui-loading-screens

This package provides loading screens for AIRI apps. [View the playground](https://proj-airi-packages-ui-loading-screens.netlify.app/).

## Use

Import `StartupScreen` from `@proj-airi/ui-loading-screens/startup-screen`. Give it the phase, progress, logo URL, and translated labels.

```vue
<StartupScreen phase="loading" :progress="50" logo-src="/favicon.svg" :label="t('stage.operations.load-models-status.loading')" :error-title="t('stage.startup.failed')" :error-details-label="t('stage.startup.details')" :retry-label="t('stage.startup.retry')" />
```

The `splash` phase shows the logo. The `loading` phase reveals a progress bar. The `error` phase shows a retry action. The `done` phase removes the screen.
The screen uses Comfortaa and the `Progress` component from `@proj-airi/ui`.
`StartupOverlay` reads the resource state and supplies the error text.
The optional `alternative-label` adds a second action for a recoverable failure.

## When to use it

Use `StartupScreen` while an app waits for the startup tasks that it tracks. Report progress from completed tasks.

## When not to use it

Do not use startup progress for downloads without completion signals. Show a separate loading state for later model changes.

## License

[MIT](../../LICENSE)
