# The character rail

Status: proposed

## Context

`docs/ai/adr/2026-11-13-chat-selects-character.md` makes a character switcher activate a character and move each window to the chat of that character.

Each app had a different switcher. The web header had a popover. The phone layout had a bottom drawer with a grid. The desktop chat window had none: the user changed the character from the menu of the main window.

The target is a layout that works like a contact list: the user selects a character on one side and chats on the other side.

Conversations can lose their own selector later. A layout that gives conversations a column leaves an empty column then.

## Decision

One component, `CharacterRail` in `packages/stage-ui`, lists the characters on every surface. It is a column of avatars. It can also show the names.

| Surface | Place | Names |
| --- | --- | --- |
| Web, wide screen | The left column of the chat panel | No |
| Desktop chat window | The left column of the window | Only in a window of 640 px or wider |
| Phone layout | A drawer from the left edge. The character button at the top left opens it. | Yes |

Rules for all surfaces:


- The list puts characters with a recent visible conversation first. The other characters keep the card order.
- The rail shows no badge, no status mark, and no message preview. AIRI is a companion, and the rail stays quiet.
- The rail has no column and no selector for conversations. The conversation selector of each surface stays where it is.
- The conversation list shows the conversations of the current character only. It has no character filter. The user changes the character in the rail to see other conversations.
- The rail does not open the character management page. It asks its host, because each app opens settings in its own way.

`useCharacterSwitcher` holds the list order and the activation. The rail and later switchers share it.

The web header loses its character popover. `ProfileSwitcherPopover` stays in the package, because another app uses it.

## Consequences

- The web chat panel is 56 px wider, for the rail.
- On the phone layout, the conversation button moves from the top left to the right, next to the settings button.
- A selection in the desktop chat window still changes the character on the desktop. A separate decision can split the stage character from the chat character.
- The rail shows no last message line, because the conversation index does not store one.
- A floating shortcut over the stage or the desktop is not part of this decision. The rail is the main entry.
