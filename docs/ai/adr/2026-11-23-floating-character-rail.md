# The floating character rail on the web stage

Status: proposed

## Context

`docs/ai/adr/2026-11-13-chat-selects-character.md` makes a character switcher activate a character and move each window to the chat of that character.

On a wide screen, the web header held the character switcher as a popover. The user had to open it to see the other characters.

## Decision

`CharacterRail` in `packages/stage-ui` lists the characters on the left of the stage-web stage, on a screen of 768 px or wider.

- The rail is a translucent capsule that floats over the stage. It does not change the position of the stage or of the chat panel.
- The closed rail shows avatars only. It opens to show names while the pointer is over it or the keyboard focus is in it.
- The rail opens 80 ms after the pointer enters and closes 200 ms after the pointer leaves. The width changes in 300 ms with an ease-in-out curve. With reduced motion, it changes at once.
- The list puts characters with a recent visible conversation first. The other characters keep the card order.
- The rail shows no badge, no status mark, and no message preview.
- The rail does not open the character management page. It asks its host, because each app opens settings in its own way.

The stage-web index page hides the character popover of the header with the `characterSwitcher` prop that the settings pages already use.

Only stage-web changes. Stage Pocket keeps the header popover on a wide screen, and the phone layout keeps its character drawer.

## Consequences

- The view slider on the left of the stage moves right by the width of the closed rail.
- The rail shows no last message line, because the conversation index does not store one.
