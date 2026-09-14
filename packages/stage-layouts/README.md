# Stage layouts

Shared Vue layouts and chat widgets for the Web, Pocket, and desktop stages.

## Use

Import layouts through `@proj-airi/stage-layouts/components/`. Web and Pocket use
`MobileInteractiveArea` for the mobile stage. Desktop chat uses `Widgets/ChatArea`.

The mobile composer keeps equal 44px attachment and voice/send controls around a
flexible input. Focus and draft text do not change its width. The attachment
control selects images, keeps them in the local draft, and sends them with text.
The input can still be docked with its explicit drag gesture.

`useMobileInteractiveAreaLayout` positions controls above the virtual keyboard
and adds bottom safe-area spacing. Recording status stays inside the input shell.

## Boundaries

Use this package for stage layout and viewport behavior. Put reusable chat state
and message components in `stage-ui`, and generic controls in `ui`. Do not use
these layouts for standalone forms that do not need stage controls.
