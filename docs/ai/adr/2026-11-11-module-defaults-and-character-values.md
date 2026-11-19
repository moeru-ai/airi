# Module settings are global defaults, and a character holds its own values

Status: proposed

## Context

`docs/ai/adr/2026-10-09-character-as-chat-member.md` decided that the activation of a character stops the writes into the global runtime stores.
Step 3 of that document does this work. This document gives the design of step 3.

The modules are consciousness (chat model), vision, and speech. The code on `main` works as follows:

- A character holds an optional provider, model, and voice for each module. An empty field inherits the global default.
- `moduleDefaults` in `stores/modules/airi-card.ts` holds the global defaults. It is a snapshot in `localStorage`.
- The module stores (`consciousness`, `vision`, `speech`) hold the resolved selection of the active character. They do not hold the defaults.
- `activateCard` resolves the character against `moduleDefaults` and writes the result into the module stores (`writeRuntimeModules`).
- A watcher copies changes of the module stores back into `moduleDefaults`, but only for the fields that the active character inherits (`followInheritedSettings`).
- The module settings pages write the module stores. Then they save the same value on the active character (`updateActiveCardConsciousness`, `updateActiveCardVision`, `updateActiveCardSpeech`).
- A chat turn and its speech output resolve the session character with `getModules(characterId)`.

This design has these problems:

- A user cannot change a global default from a module settings page. Each selection becomes a value of the active character.
- The pages do not tell the user that the selection belongs to one character.
- The module stores have one value for all windows. Two windows cannot show chats of two characters with different models.
- Two copies of the defaults exist. The watcher and three other code paths keep them the same.
- Some paths read the module stores during a turn. They get the selection of the active character, not of the session character.

## Decision

### One source for the defaults

- The module stores hold the global defaults. They hold nothing else.
- `moduleDefaults` and its `localStorage` key are removed. `getModules(characterId)` resolves a character against the module stores.
- `rememberInheritedSettings`, `followInheritedSettings`, and `writeRuntimeModules` are removed.
- The activation of a character does not write the module stores. `applyActiveCardSettings` keeps the display model and the artistry steps until a later change moves them.
- Automatic selections write the default directly. Examples are the voice that the official catalog selects and the defaults of a login.

### Order of the sources

The order does not change: the value of the character, then the global default.

- A model is inherited only when the provider of the character is empty or equal to the default provider.
- A voice is inherited only when the provider and the model are equal to the defaults.

### Settings pages

- The module settings pages edit the global defaults. They do not save a value on a character.
- The description of each page says that the selection is the default, and that a character uses it unless it has its own value.
- The pages show no notice about one character. An earlier draft had such a notice, and it was removed: the pages edit defaults, and the text says so.
- The character editor edits the values of one character. It keeps the option "Inherit global settings" for each field.

### Readers during a turn

A path that runs for a chat turn resolves the session character. It does not read the module stores directly.

| Path | Today | After this change |
| --- | --- | --- |
| Send gate (`chatReady`) | Global selection | Selection of the character of the current chat |
| Send gate of an external input (`context-bridge`) | Global selection | Selection of the character of the target session |
| Image reading for chat (`use-vision-inference`, `chat.ts`) | Global vision selection | Vision selection of the session character |
| Tool image reader on a tool rerun | Global chat model | Chat model of the session character |
| Reasoning default of the provider instance | Global provider and model | Provider and model of the turn |
| Voice catalog for speech output | Loaded for the global provider only | Also loaded for the provider of the character of the shown chat, when it is another provider |

The speech store keeps one voice catalog for each provider. A load for another model of the selected provider discards that catalog and clears the selected voice.
So speech output reads the voice of a character from a second list, by provider and model. `loadVoicesForCharacter` of the speech store fills it. That list does not validate a selection.

These paths have no session and keep the global default: the voice end judge, the voice rephrase, the screen capture of the vision orchestrator, the tool card generation, and the reply to a Spark notification.
Before step 2, they got the selection of the active character.

### Data of existing installations

- At the first start after the update, the module stores hold the resolved selection of the active character. `initialize` writes `moduleDefaults` into the module stores one time and then removes the key.
- A selection that a user made on a module settings page is a value of the character that was active at that time. It stays a value of that character.
- The data does not tell a deliberate value of a character from a selection on a settings page. Thus no automatic rule can remove these values safely.
- The text of the settings pages tells the user that a character can have its own value. The character editor shows the values of a character.

### Windows

- A page writes the defaults through the synchronized leader actions that the module stores already have.
- A card snapshot must not cause a state proposal from a follower window. The current tests for this rule stay.
- `getModules` creates the module stores when a caller needs a resolved selection. A consumer that reads only card metadata does not call it and does not create them.
- `initialize` creates the module stores in the leader. A follower sends its selections and action requests to the leader, and a request for a store that the leader lacks fails.

## Non-goals

- Temperature and top P for each character. A character has no such field.
- Speech recognition for each character. It belongs to the user and the device, and it stays global.
- Tools and MCP servers for each character.
- The display model that follows the chat. Step 3 of the roadmap ("the chat selects the stage") does this work.
- The removal of the active character. It stays as the selector of the chat and of the display model until that step.

## Steps

| Step | Content | Workspaces | State |
| --- | --- | --- | --- |
| 1 | Resolve the session character in the turn paths of the table. | `packages/stage-ui`, `packages/stage-layouts`, `apps/stage-tamagotchi` | Done (#3487) |
| 2 | Make the module stores the source of the defaults. Migrate `moduleDefaults`. Remove the writes on activation and the watcher. Stop the saves of the module settings pages on the active character. | `packages/stage-ui`, `packages/stage-pages` | Done (#3492) |
| 3 | Change the text of the module settings pages to say that they edit the default. | `packages/i18n` | This change |
| 4 | Link a problem of an inherited selection to the module page. | `packages/stage-ui` | To do |

Step 1 goes first. Without it, step 2 stops the send gate, the image reading, and the voice catalog of a character with its own values.
Step 2 includes the handlers of the module settings pages. Without that part, a selection on a settings page becomes a value of the active character and a default at the same time.
Step 3 changes what the pages show, so it is a pull request of its own.

## Consequences

- A user can change a model for all characters from one page.
- Two windows can show chats of two characters, because the activation of a character changes no shared selection.
- A character that got a value from a settings page before the update keeps it. The user must set the field to "Inherit global settings" in the editor to follow the default.
- About 20 test assertions that read a module store after an activation change. They must read `getModules(characterId)` instead.
- `updateActiveCardConsciousness`, `updateActiveCardVision`, `updateActiveCardSpeech`, `selectActiveCardVisionProvider`, and `currentModels` have no caller after step 2 and are removed. The vision store has `selectProvider`, which stores the catalog default model as the default.
