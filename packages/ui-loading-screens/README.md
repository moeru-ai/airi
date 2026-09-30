# @proj-airi/ui-loading-screens

This package provides loading screens for AIRI apps. [View the playground](https://proj-airi-packages-ui-loading-screens.netlify.app/).

## Use

Import `StartupScreen` from `@proj-airi/ui-loading-screens/startup-screen`. Give it the phase, progress, locale, logo URL, and translated labels.

```vue
<StartupScreen phase="loading" :progress="50" :locale="locale" logo-src="/favicon.svg" :label="t('stage.operations.load-models-status.loading')" :error-title="t('stage.startup.failed')" :error-status-label="t('stage.startup.interrupted')" :error-hint="t('stage.startup.recover')" :error-details-label="t('stage.startup.details')" :error-details-close-label="t('stage.startup.close-details')" :retry-label="t('stage.startup.retry')" />
```

The `splash` phase shows the logo. The `loading` phase shows progress near the lower edge.
The `error` phase shows a rounded, moving warning band with a thicker border. Desktop makes the warning band as wide as the progress bar.
Mobile hides the logo. The warning band, progress bar, and bottom actions form one group with short gaps. Error progress has no percentage label.
The small details button opens a desktop tooltip or a mobile bottom drawer. The `done` phase removes the screen.

The screen uses Comfortaa for the brand and content. The error band uses WDXL Lubrifont SC for English and Chinese.
Japanese uses WDXL Lubrifont JP N. UnoCSS loads both fonts from Fontsource for Web and UI previews.
Pocket and Electron import the installed Fontsource packages and bundle their font assets.
The progress bar uses `Progress` from `@proj-airi/ui`.
`StartupOverlay` reads the resource state and supplies the error text.
The optional `alternative-label` adds a second action for a recoverable failure.

## When to use it

Use `StartupScreen` while an app waits for the startup tasks that it tracks. Report progress from completed tasks.

## When not to use it

Do not use startup progress for downloads without completion signals. Show a separate loading state for later model changes.

## License

[MIT](../../LICENSE)
