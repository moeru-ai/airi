# Store wake words with character cards

Status: accepted, partly implemented.

- Implemented in #2768: wake words in the character card, validation in card import and export, and device-local conflict ownership in `useWakeWordsStore`.
- Implemented in #2772: the routing entry points. `createVoiceActivityPlugin` takes a `detectWakeWord` adapter, and `useVoiceStore.resolveWakeTarget` selects the character session.
- Not implemented: the KWS adapter, the keyword tool, and model bundling and download. No application passes `detectWakeWord` yet.

AIRI stores each role wake word and its encoded pronunciations in the owning character card. This lets a shared card carry its preferred name across devices. The selected KWS model is the Chinese and English Zipformer 3M model, so the card's token sequences depend on that model's vocabulary. Card import and export must preserve and validate the wake word entries.

The keyword tool accepts model-generated token sequences and validates them before changing the card. It returns pronunciation conflicts as structured tool results. The character decides how to explain a conflict to the user. A role wake word can select its card before AIRI accepts one input utterance.

When an imported card has the same token sequence as another card, AIRI asks the user which character owns that pronunciation. Both cards keep their configured entries. Only the chosen owner's copy is active. The other copy is paused until the user changes ownership or removes the conflict. Other non-conflicting pronunciations remain active.

Pronunciation ownership is local to the device's character library. Card import and export carry every configured pronunciation, but not a local conflict choice. Another device asks its user to choose an owner if its installed cards conflict.

Desktop and Pocket include the selected model with the application. Web downloads a pinned model version on first use and caches it for later sessions.
