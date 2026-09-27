# Character-owned conversations and window-local selection

## Status

Implemented with character-scoped conversations and model binding on cards.
No page redesign or hosted schema change.

## Context

Card definitions, active card selection, and resolved module settings shared one
snapshot. Activating a card in one window changed every window. Conversation
creation and leader-routed sends also read the leader's current character.
This could combine one conversation with another character's prompt or model.

## Decision

Use the existing card id as the character identity. A character owns its card
definition and display-model binding. Each conversation references that id.
Do not add a second character entity or derive identity from a display name.

The shared card catalog owns definitions and inherited defaults. Its commands
take explicit card ids and never navigate a window. The existing storage keys
and card format remain unchanged.

Each window owns its selected character, selected conversation, resolved module
settings, and speech catalog requests. Stored selections seed startup, but
storage events and Pinia snapshots do not replicate live selection.
Changing a shared card still updates windows that selected that same character.

The chat session store separates shared data commands from local navigation.
Creation and hydration receive an explicit character id. Opening a conversation
selects its owning character and display model. Concurrent hydration is isolated
by character; account epochs and local selection generations reject stale work.

The send path resolves the model and system prompt from conversation metadata.
The runtime captures provider identity when it queues a turn and uses that same
identity for streaming and telemetry. A later window selection cannot relabel it.

Empty card settings still inherit global defaults. A model cannot inherit across
providers, and a voice cannot inherit across providers or models. One resolver
implements this policy for runtime activation and conversation sends.

## Lifecycle and limits

- Deleting a card selects the built-in card in affected windows. It retains
  historical conversations rather than cascading an unexpected history deletion.
- Starting a new turn requires an existing character. Orphan history retains
  its last stored prompt instead of borrowing the currently selected character.
- A window remembers its selected conversation per character only for its
  lifetime. Existing persisted indexes seed new windows.
- Provider credentials and account identity keep their existing shared owners.
- Global vision request policies remain shared through explicit leader actions.
  Their snapshots do not change a window's selected vision provider or model.
- This change does not add remote card synchronization or change cloud chat
  schemas. Cloud-only conversations keep their existing default-card binding.
- This change does not redesign page layouts, add group chat, or change
  autonomous artistry scheduling.

## Verification

The conversation selector shows only the current account's conversations for
the selected character. Changing the character updates the list and selected
conversation. Deleted-character history remains stored but is not in that list.

Each card in the card list shows its model preview and a model selector.
Editing an inactive card's binding does not select that card or change the
current runtime model. Selecting a card restores its own model binding.
The existing card editor keeps its module settings. Other UI stays unchanged.

Stage Web captures cover desktop and mobile layouts. Browser interactions verify
that character selection changes the conversation list and model, and that
editing another card does not navigate. Installed desktop and native mobile
acceptance remain separate.

Real Pinia and BroadcastChannel browser tests cover independent character,
model, and conversation selection; shared card edits without follower state
proposals; opening history; and deleting an active card without deleting history.
Existing inheritance, speech, session lifecycle, and settings tests cover the
new local ownership boundaries. Runtime tests verify provider identity remains
stable after the visible selection changes.
