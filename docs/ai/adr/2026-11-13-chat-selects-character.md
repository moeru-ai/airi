# The chat selects the character

Status: proposed

## Context

`docs/ai/adr/2026-10-09-character-as-chat-member.md` makes a character a member of a chat.
`docs/ai/adr/2026-11-11-module-defaults-and-character-values.md` makes each turn read the modules of the session character.

One relation still goes the other way. The card store holds a global `activeCardId`, the active character:

- A change of the active character moves each window to the index session of that character (`watch(activeCardId)` in `session-store.ts`).
- The activation writes the display model of the stage (`applyActiveAvatarModel`). The stage, the Live2D ACT prompt, the background, the window titles, and the "New" button of the session list read the active character.
- `setActiveSession` does not change the active character.

So a user who opens a chat of another character from the session list gets the history, the chat model, and the voice of that character. The stage, the title, and the background stay on the active character.

Facts that limit the design:

- In the desktop app, only the main window has a stage. Every turn runs there, and all speech plays there.
- The selected session belongs to one window. It is not synchronized, and a test pins this rule.
- The display model of the stage is one synchronized value, and about 20 consumers read it.
- The index records one session for each character. `setActiveSession` does not write it, and a test pins this rule.

## Decision

### The active character follows the chat

- The active character stays in the code. Its meaning changes: it is the character of the chat that the user selected last, in any window.
- When a window selects a session, the character of that session becomes the active character.
- The stage, the ACT prompt, the background, the window titles, and the settings pages continue to read the active character. They need no change, because the active character is now the character of the selected chat.
- "New" creates a chat with the active character. That is the character of the current chat of the window.
- The display model stays one synchronized value. The desktop app has one stage, so one value is correct there.

This gives the result of a stage that follows the chat without a second model selection.

### Windows follow the active character

- A change of the active character moves a window to the index session of that character, as before.
- The window that already shows a chat of that character keeps its chat. Its user selected that chat.
- So every window shows a chat of the active character. Two windows do not show chats of two characters.
- A character switcher continues to activate a character. Every window then moves to the index session of that character.

### The leader window

- The action that resolves the session of the active character runs in the synchronization leader. It returns the id, and the window that asked selects it.
- Before this change, that action also wrote the selection of the leader window. A window that initialized moved the leader window.

### Where the active character stays the input

These paths have no session. They read the active character:

- A reply to a Spark notification.
- The artistry widget and the image journal outside a turn.
- A window without a session, a reset, and the first chat of an external scene.

### Not decided

- Which session a contact opens: the index session of the character, or the session that the user opened last. `setActiveSession` does not write the index, and a test pins this rule. The contact list (step C4 of the roadmap) decides this.
- A turn that starts without a selection does not activate its character. A wake word routes a turn to a character and navigates no window, and a test pins this rule. An external scene, for example a Discord channel, must not take the stage from the chat in use. So the stage can show one character while another one speaks.

## Non-goals

- A stage for each window with its own display model.
- Two windows that show chats of two characters.
- A new name for `activeCardId` in code.
- The contact list. It is step C4 of the roadmap.
- Chats with many characters.

## Steps

All steps are in one change.

| Step | Content | Workspaces | State |
| --- | --- | --- | --- |
| 1 | The action that resolves the session of a character does not write the selection of the leader window. | `packages/stage-ui` | This change |
| 2 | A selected session activates the character of the session. | `packages/stage-ui` | This change |
| 3 | A window that already shows a chat of the new active character keeps its chat. | `packages/stage-ui` | This change |

## Consequences

- A chat of another character, opened from the session list, shows that character on the stage, with its ACT controls, its background, and its name in the window title.
- A second window moves to the index session of that character. It does not move to the same session.
- Several browser tabs share the active character, as before.
- A wake word for another character still starts a turn without a change of the stage.
