# Route voice turns by character session

Status: accepted, implemented except wake word detection.

- PR #2771 runs chat sessions concurrently. PR #2772 resolves voice settings by session and fades playback over 100 ms before capture.
- PR #2773 shows editable drafts in the desktop inlay.
- Wake word detection has routing entry points but no detector. See [Store wake words with character cards](2026-09-30-store-wake-words-with-character-cards.md).

Each voice turn belongs to one character session, even if the user wakes another character while the first replies. Different sessions can generate text at the same time. Each new voice request reads its character's latest settings. A request in progress keeps its original settings. Voice submissions resolve settings by session. Text sends retain the active chat provider and model.

The desktop inlay presents editable transcripts when Auto send is off. New speech for the same session appends to its draft. Waking another character brings that character's draft forward and keeps earlier drafts pending. Sending or canceling the front draft returns to the previous pending draft. The inlay's visible draft does not itself switch the chat window's session.

Holding Push to Talk interrupts speech playback. The recording indicator appears at once, playback fades out over about 100 ms, and voice capture starts after the fade. This keeps the assistant's final audio out of the user's transcript.

Wake Word detection remains active while a character speaks. A matched wake word interrupts playback with the same fade, selects the matched character session, and opens one voice input window after the fade. The input path must prevent playback echo from matching the character's own wake word.
