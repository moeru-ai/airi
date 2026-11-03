# Device sync switches

Status: accepted

## Context

A signed-in app syncs four kinds of data to the account:

| Data | Code | Before this change |
| --- | --- | --- |
| Chats | `stores/chat/session-store.ts`, over a WebSocket and an outbox | Always on |
| Providers, with their API keys | `stores/providers/config.ts`, a pull every 5 minutes and a push after each change | Always on |
| Character cards | `stores/modules/airi-card.ts` | Experiment flag, off by default |
| Live2D and VRM models | `stores/display-model-cloud.ts` | Experiment flag, off by default |

The paths are relative to `packages/stage-ui/src`.

The two experiments are ready to release. The user had no way to see or stop the sync of chats and providers.

## Decision

- `stores/sync-preferences.ts` owns one switch for each kind of data. Each switch is on by default.
- The switches belong to the device. They do not follow the account. Each device decides which of its local data leaves the device.
- The account settings have a Sync section with the four switches.
- The experiment flags `character-card-sync` and `display-model-sync` are removed. On the first start, the store copies a saved choice of these flags. A device that turned a sync off keeps it off.
- A switch that is off pauses the sync. It deletes no data on the device or in the account. Changes from the device wait and sync when the switch is on again:
  - Chats: the outbox keeps the messages, the tombstones keep the deletions, and `cloudTitlePending` keeps the titles. No WebSocket opens.
  - Providers: a changed provider stays dirty, and a deletion stays in `pendingDeletes`.
  - Character cards and models: the next sync compares the device and the account again.

## Scope and non-goals

- Out of scope: a switch that follows the account, a deletion of the account copy of one kind of data, and a sync status for each kind of data.
- Out of scope: a sync choice in onboarding. Onboarding gets a new design in separate work.
- Out of scope: the sync of images in chats. Images stay on the device.

## Test plan

- `stores/sync-preferences.test.ts`: the defaults, and the copy of the experiment choices.
- `stores/providers/config.test.ts`: no request while the provider switch is off, and a sync when it is on again.
- The existing card and model sync tests set the new switches.
- The account settings browser test shows the Sync section and saves a switch.
