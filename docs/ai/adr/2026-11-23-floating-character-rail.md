# The floating character rail on the web stage

Status: proposed

## Context

`docs/ai/adr/2026-11-13-chat-selects-character.md` makes a character switcher activate a character and move each window to the chat of that character.

On a wide screen, the web header held the character switcher as a popover. The user had to open it to see the other characters.

## Decision

`CharacterRail` in `packages/stage-ui` lists the characters on the left of the stage, on a screen of 768 px or wider.

- The rail is a translucent capsule that floats over the stage. It does not change the position of the stage or of the chat panel.
- The closed rail shows avatars only. It opens to show names while the pointer is over it or the keyboard focus is in it.
- The rail opens 80 ms after the pointer enters and closes 200 ms after the pointer leaves. The width changes in 300 ms with an ease-in-out curve. With reduced motion, it changes at once.
- The rail keeps the order of the cards, so each character keeps its place while the user chats.
- A ring marks the character on the stage. Its accessible name and its tooltip say so in words.
- The rail shows no badge and no message preview.
- A pick on the rail goes to its host. The rail over the stage and the rail beside the floating chat activate the character. The docked rail beside a chat list picks the chats that the list shows, as `2026-11-13-chat-selects-character.md` describes.
- The rail does not open the character management page. It asks its host, because each app opens settings in its own way.

The header has no character switcher. The rail replaces it, so the header keeps no control and no prop for it. `ProfileSwitcherPopover` stays in the package, because stage-tamagotchi-kirie uses it.

stage-web and Stage Pocket share the header and the wide stage page, so the wide page of Stage Pocket shows the rail too. The phone layout keeps its character drawer.

### Beside the floating chat

The floating chat window of the desktop app has a column beside its panel, on the side away from the character.

- The column holds two islands of the same width, 56 px. Both are rounded rectangles with 20 px corners and the surface of a blurry `Dock`.
- The upper island holds the window buttons: Fold, Keep on top, and the grip of a free chat. The buttons are icons, so they fill the island as the buttons of a `Dock` do.
- The lower island is the rail in its `island` variant. It shows avatars only, with names in tooltips.
- An avatar is a solid picture, heavier than an icon. So the island leaves 12 px around each avatar and draws no fill behind it.
- A ring marks the character on the stage. A neutral ring marks the avatar under the pointer. Manage stands at the end of the island.
- A pick activates the character at once, with or without a chat. With voice input on, the user can talk to it at once. The panel then shows the conversations of that character.
- The panel has two levels: the list of the conversations and the open conversation. The list pushes in from the start. An opened conversation pushes in from the end.
- The message feed has no panel and no column. Its dock opens the list. The panel and the column show until the user picks a conversation.

## Consequences

- The view slider on the left of the stage moves right by the width of the closed rail.
- The rail shows no last message line, because the conversation index does not store one.
- The minimum width of the floating chat stays 440 px, so its panel keeps 376 px beside the column.
