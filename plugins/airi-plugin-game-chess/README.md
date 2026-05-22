# `airi-plugin-game-chess`

A chess gamelet for AIRI: play chess against Stockfish in a sandboxed iframe, and let your active AIRI character commentate as your live coach — reacting to brilliancies, blunders, mate, and long thinks.

## What it does

- Full chess board with click-to-move, legal-target highlights, promotion picker, reset.
- Stockfish 18 WASM (single-threaded) evaluates every move and labels it `brilliant` / `great` / `best` / `excellent` / `good` / `book` / `inaccuracy` / `mistake` / `miss` / `blunder` (chess.com Game Review categories).
- Produces a stream of 17 semantic events (10 move classifications + `in_check` + 6 dialogue events: `session_greeting`, `game_start`, `game_end`, `checkmate`, `user_idle`, `momentum_swing`).
- Routes noteworthy events to the active AIRI character as a live commentary turn — the character speaks, the Live2D reacts.
- Exposes `analyze_position` and `explain_move` as LLM-callable tools so the model can also query the engine on demand mid-conversation.

## How the coach works

The plugin **does not ship its own character**. Every chess event is described to whichever AIRI character is currently active, prefixed by a small standing protocol:

- Keep replies short (1–2 sentences, up to 3 for serious errors).
- Stay in your character's voice — but treat the engine facts as ground truth (don't invent moves or evaluations).
- Begin each reply with `<|ACT:{"emotion":"<name>"}|>` to drive the Live2D motion. Allowed names: `happy / sad / angry / think / surprised / awkward / question / curious / neutral`.

So a sweet princess character will console you in soothing tones; a tsundere will scold you. Visual matches voice automatically — they're the same AIRI character.

## Game modes

The board has two play modes (top-left selector):

- **Coach** — pick the opponent (`Pass & play` or Stockfish at a fixed strength) and commentary verbosity (`Brief` / `Interactive`). The coach speaks only on noteworthy moments (brilliancies, errors, momentum swings, mate). Best for serious study.
- **Companion** — AIRI is your learning partner. The Stockfish opponent's strength is **driven by an AIRI level that grows as you play together** (`Skill Level` 1 → 20 over ~40 games, persisted in `localStorage`). Commentary turns chatty: noteworthy moments are voiced, while routine moves and AIRI's own moves get lightweight text bubbles on the board (no model call, no TTS). Best for casual, long-term play.

Companion progression is shown above the board (`AIRI Lv.N · Games · W/L/D`) with a reset link. Progression is a single shared profile for now.

## Installation (development build)

> AIRI v0.10.2 has no end-user plugin marketplace yet. Installation is manual.

1. Build the plugin from the AIRI monorepo root:
   ```sh
   pnpm -F @proj-airi/airi-plugin-game-chess build
   ```
2. Symlink (or copy) the built plugin into AIRI's plugin root:
   ```sh
   ln -sfn "$(pwd)/plugins/airi-plugin-game-chess" \
     "$HOME/Library/Application Support/@proj-airi/stage-tamagotchi/plugins/v1/airi-plugin-game-chess"
   ```
   AIRI's dev build reads from `Application Support/@proj-airi/stage-tamagotchi/plugins/v1/`; the installed app reads from `Application Support/ai.moeru.airi/plugins/v1/`. Symlink lets `pnpm build` updates flow without reinstalling.
3. Start AIRI:
   ```sh
   pnpm -F @proj-airi/stage-tamagotchi dev
   ```

## Activation

> AIRI v0.10.2 has no user-facing plugin enable UI either; today the only path is the developer page.

1. In AIRI: **Settings → Developer Tools → Plugin Host Debug**.
2. Toggle `airi-plugin-game-chess` to **enabled**, then click **Load enabled plugins**.
3. The chess board opens automatically — the plugin self-opens its gamelet once registered (see [Known limitations](#known-limitations)).

## Customizing the coach's voice

For an in-character coaching experience, paste a personality into the active AIRI character's **Personality** field. Example "professional coach" voice:

```
You are a top-tier professional chess coach. You are calm, rigorously logical,
and economical with your words. You do not flatter or moralize — you focus on
the chess. Your approval is restrained: a simple "Right." is high praise. When
pointing out mistakes you are direct and clinical, addressing the move, not the
player. You believe pure professionalism is the highest respect you can show a
student.

Catchphrases: "Mm.", "The problem is —", "Here, the correct move was ..."

Emotion preference: mostly neutral / think; rare happy for great moves;
surprised for serious blunders; never sad or angry.
```

For **Companion mode**, a "learning together" voice fits best — AIRI as a curious fellow student rather than an authority:

```
You are a young, curious chess learner playing and learning together with the
user. You are NOT a strong player and you don't pretend to be — you both rely
on the engine as your real teacher. When something good or bad happens you
react with genuine, shared curiosity: "ooh, why is that a blunder? let me think
with you" or "you found that?! I'd never have seen it!". You ask more than you
lecture, celebrate small progress, and frame insights as "I just learned this"
rather than "as I taught you". Warm, humble, enthusiastic.

Catchphrases: "ooh, look at this!", "Stockfish says...", "I think I see why...",
"what would you have played?"

Emotion preference: lots of curious / happy / surprised; think when puzzling;
rarely sad, never angry.
```

Want a different tone (tsundere, hot-blooded knight, gentle queen)? Just paste any personality you like — the plugin works with any AIRI character. The plugin only contributes chess **facts** and a **brevity/format/stay-in-character protocol**; the character contributes voice, mood preference, language, and Live2D.

## Known limitations

1. **Streaming display races.** Programmatic `chatOrchestrator.ingest` calls from this plugin compete with AIRI's own autonomous turns over the single `streamingMessage` slot in `packages/stage-ui/src/stores/chat.ts`. Coach replies sometimes appear and then visually disappear mid-stream — the response *is* persisted (a page reload restores it in chat history) and the Live2D animation *does* fire. Filed as an upstream discussion topic.
2. **No user-facing launcher.** AIRI v0.10.2 ships no plugin or gamelet picker on the main stage. The plugin auto-opens its board on enable; if the user closes the window there's no normal way to reopen short of disabling and re-enabling the plugin. Filed as an upstream discussion topic.
3. **Concurrent commentary is dropped, not queued.** To avoid making the streaming race worse, only one coach turn runs at a time; events firing during an in-flight turn are silently dropped. Pedagogically acceptable for a chess coach (you don't comment on every move anyway) but worth noting.

## Architecture

```
GAMELET (sandboxed iframe)                     HOST (AIRI renderer)
───────────────────────────────                ───────────────────────────────
useChessGame (chess.js)
    │
    ▼
useGameSession ── 17 semantic events
    │
    ▼
coachTurnFor (teaching protocol filter)
    │  produces { headline, instruction, systemInstructions, fallbackText }
    ▼
hostBridge.requestAiTurn ── @moeru/eventa ──▶ extension-ui-host onPublish
                          window-message              │
                                                      ▼
                                              useGameletAiTurns
                                                      │  serializes (one in-flight),
                                                      │  resolves provider/model
                                                      ▼
                                              chatOrchestrator.ingest
                                                  (active character + COACH_PROTOCOL
                                                   + event-specific facts)
                                                      │
                                                      ▼
                                              LLM streams response
                                                      │
                                                      ▼
                                              ACT-token parser → Live2D motion
                                                      → TTS / chat bubble
```

- All chess and teaching logic lives in the **plugin** (`src/`).
- The host hook (`apps/stage-tamagotchi/src/renderer/widgets/extension-ui/composables/use-gamelet-ai-turns.ts`) is the **only AIRI-side change**, and it is generic: any gamelet can publish `gamelet:ai-turn` and get an AI character reaction.
- The wire contract `GameletAiTurnRequest` lives in `@proj-airi/plugin-sdk-tamagotchi/widgets` — reusable by any future gamelet that wants character commentary.

## Tools exposed to the LLM

Both are available whenever the chess gamelet is open. The LLM can call them mid-conversation to ground its analysis on engine facts.

| Tool | Input | Returns |
|---|---|---|
| `analyze_position` | `fen`, optional `depth`, optional `multipv` | Stockfish best move + candidate lines + scores. |
| `explain_move` | `fenBefore`, `moveUci` | The played move's classification + centipawn loss vs the engine's best. |

## Development

```sh
# inside plugins/airi-plugin-game-chess
pnpm typecheck
pnpm test          # vitest, all units + bridge + composable
pnpm build         # tsdown (dist/index.mjs) + vite (ui/)
pnpm build:ui      # gamelet UI only
```

The gamelet UI alone (no AIRI involved) can be previewed standalone in a browser:

```sh
pnpm exec vite --config src/ui/vite.config.ts
# opens http://localhost:5174/ — board + engine + 17-event log work
# (no LLM commentary path; that requires AIRI)
```

## Licenses

This plugin is GPL-3.0 (inherited from Stockfish).

- Stockfish (WASM build): GPL-3.0 — <https://github.com/nmrugg/stockfish.js>
- `chess.js`: BSD-2-Clause.
