## Recent Integrations

- **PR #851**: `feat(stage-tamagotchi): add option for chat area send key`
  - **Status**: ✅ **Squatted**. Added UI to General Settings.
- **PR #1302**: `feat: add OpenRouter as a speech (TTS) provider`
  - **Status**: ✅ **Squatted**. Integrated into fork.
- **PR #1256**: `feat(providers): add Amazon Bedrock provider`
  - **Status**: ✅ **Squatted**. Integrated into fork.

## Current Priorities

- **PR #1065**: `fix(onboarding): allow manual model entry when list is empty`
  - **Why it matters**: Good baseline fix for onboarding. More importantly, onboarding should stop acting like a weird shortlist-driven flow and expose the real provider surface instead of implying that unsupported providers do not exist.
  - **Fork direction**: Use this as the starting point for a broader onboarding refresh:
    - keep manual entry fallback
    - remove the misleading truncated provider experience
    - surface the full supported provider set cleanly
  - **Priority**: High (Under consideration)

- **PR #917**: `feat(stage-tamagotchi): vision`
  - **Why it matters**: Vision support / Screenshare API. Essential for "seeing" the screen (Minecraft/Factorio/etc).
  - **Status**: Active discussion (Mar 20). Blocking on `electron-audio-loopback` historically but core API is maturing.
  - **Priority**: High (Watch/Research)

## Maybe, But Not Yet

- **PR #1190**: `fix(stage-pages): add missing local provider settings routes`
  - **Status**: Merged upstream (Mar 17).
  - **Decision**: Worth checking for overlap with existing fork changes, likely easy to absorb if not already covered.

- **PR #1148**: `feat(ui,stage-ui,stage-pages,i18n): transcription confidence filter`
  - **Current read**: Lower priority because the fork already has a useful STT toast that shows what the server heard.
  - **Decision**: Do not prioritize right now.

## Explicitly Deferred / Pass (Avoid)

- **PR #1237**: `feat(stage-ui): add chat settings with stream idle timeout`
  - **User Feedback**: "dont' touch it with a 10ft poll im so divergent any attempts would just nuke our code"
  - **Priority**: N/A (**PASS**)

- **PR #1033**: `feat(stage-ui-live2d): exp3 expression system + auto-blink rework`
  - Too large and too far from the current fork state. Integration cost is high.

- **PR #1222**: `fix(llm): flatten content array for OpenAI-compatible providers`
  - Looks risky relative to the current fork because nothing is obviously broken there right now. Avoid speculative provider churn unless a real bug appears.

## Operational Notes / Follow-ups

- **PR #1295**: Re-open candidate. The actual fix for "crackly" audio was identified as the `mediabunny` library, not the previous stability attempts.
- **PR #1289**: Needs a comment explaining the "Snapshot Restore" necessity: It allows users to snap back to their favorite position after moving the window willingly.
- **PR #1298**: Needs updating to current state before posting new screenshots.
