# Desktop voice recording and draft windows

## Context

Calling words and global Push to Talk can record while the chat window is closed.
The user needs recording feedback and a place to review text when automatic sending is off.

## Decision

Use two windows with separate interaction contracts.
The recording indicator ignores mouse events and cannot receive keyboard focus.
The draft window contains the editor and explicit Send and Discard actions.
Both windows use the minimal renderer runtime and follower-only Pinia synchronization.

The main renderer owns presentation.
It forwards recording and transcription progress through an Eventa broadcast channel.
New indicator windows request a current snapshot after subscribing.
Each event carries an immutable segment ID, so an older transcription cannot hide a newer recording.

The shared `hearing-drafts` store owns completed text and its review order.
Leader actions edit, discard, promote, and claim drafts across windows.
The editor claims a draft before sending and restores failed text to its original session.
A completed draft stays available when its recording input closes.

## Consequences

High-frequency recording updates do not become whole-store Pinia snapshots.
The input runtime owns transcription and delivery policy.
The desktop presenter only observes activity and drafts.
Window operations run in order and stop after disposal.
