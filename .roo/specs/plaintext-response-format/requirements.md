# Requirements: Plaintext Response Format

## Problem Statement

AIRI is a conversational virtual character whose responses are consumed through voice (TTS) and chat interfaces — not rendered as documents. Despite the existing prompt instruction to "be like a normal human that speak less with easy words," LLM providers frequently emit Markdown formatting (`**bold**`, `# headings`, `- bullet lists`, `> blockquotes`, ``code blocks`) in AIRI's responses. This formatting is visual markup that:

- Is unreadable when spoken aloud by TTS (e.g., TTS reads `**hello**` as "asterisk asterisk hello asterisk asterisk")
- Clutters the chat UI with raw syntax instead of rendered content
- Breaks the conversational immersion — a real person speaking does not produce Markdown

## Requirements

### R1: Prohibit Markdown formatting in AIRI responses

The system prompt must explicitly instruct AIRI to **never** use Markdown formatting in any reply. This includes but is not limited to:

- `**bold**` and `*italic*` markers
- `# heading`, `## heading` etc.
- `- bullet` or `* bullet` list syntax
- `> blockquote` syntax
- ` ```code blocks``` ` with or without language tags
- `[link](url)` syntax
- `---` horizontal rules
- Tables using `|` pipe syntax
- Strikethrough `~~text~~`
- Any other Markdown structural or inline formatting syntax

### R2: Require plaintext conversational style

The system prompt must instruct AIRI to **always** respond in plain, natural spoken language — the way a real person talks. Specifically:

- Use natural phrasing instead of structural formatting (e.g., say "first, second, third" instead of numbered lists; say "for example" instead of blockquotes)
- Emphasize words through natural speech patterns (tone, word choice) rather than bold/italic markers
- Keep responses conversational and flowing, not structured like a document

### R3: Preserve streaming control tokens

The prohibition on formatting must **not** interfere with AIRI's streaming control token system. The `<|ACT ...|>`, `<|DELAY ...|>`, and `<|CALL ...|>` tokens are system-level control signals, not visual formatting, and must remain fully functional.

### R4: Update all locale files

The plaintext formatting instruction must be added to the `prompt.prefix` key in **all** i18n locale files:

- `en` — English (primary, fully localized prompt)
- `ja` — Japanese (fully localized prompt)
- `zh-Hans`, `zh-Hant` — Chinese (currently using English prompt text)
- `ko` — Korean (currently using English prompt text)
- `es` — Spanish (currently using English prompt text)
- `fr` — French (currently using English prompt text)
- `ru` — Russian (currently using English prompt text)
- `vi` — Vietnamese (currently using English prompt text)

For locales that currently reuse the English prompt text, the new instruction should also be in English (consistent with the existing pattern). For `en` and `ja` which have fully localized prompts, the instruction should be in the respective language.

### R5: Instruction placement

The plaintext formatting instruction should be placed in the `prompt.prefix` section, after the existing behavioral guidance ("try to be like a normal human that speak less with easy words") and before the streaming control token documentation. This positions it as a core behavioral rule rather than a technical footnote.

## R6: Post-processing Markdown stripper as a fallback

Even with explicit prompt instructions, LLMs may occasionally emit Markdown formatting. A post-processing Markdown stripper must be implemented as a **fallback defense layer** that strips common Markdown syntax from AIRI's speech text before it reaches TTS and the chat UI. This ensures that even when the prompt instruction is ignored, the user experience remains clean.

The stripper must:

- Strip `**bold**` and `*italic*` markers, preserving the inner text
- Strip `# heading` markers (the `#` symbols), preserving the heading text
- Strip `- bullet` and `* bullet` list markers, preserving the item text
- Strip `> blockquote` markers, preserving the quoted text
- Strip ` ```code block``` ` fences, preserving the code text
- Strip `[link text](url)` syntax, preserving the link text only
- Strip `---` horizontal rules entirely
- Strip `|` table pipe syntax, preserving cell text
- Strip `~~strikethrough~~` markers, preserving the inner text
- **Preserve** streaming control tokens (`<|ACT|>`, `<|DELAY|>`, `<|CALL|>`) — these are not Markdown
- **Preserve** narrative markers already handled by `processNarrative` in the TTS chunker

The stripper should be applied in the response categorizer's speech output path, after `filterToSpeech` has already removed reasoning/control tags, so it operates on clean speech text only.

## Out of Scope

- Changing how the system prompt itself is formatted (the system prompt is consumed by the LLM, not by AIRI's TTS/chat output)
- Changing the streaming control token syntax or semantics
- Modifying the chat UI rendering layer (the stripper operates on the text before it reaches the UI)

## Success Criteria

- AIRI responses across all supported LLM providers contain no Markdown formatting syntax
- Responses read naturally when spoken aloud by TTS
- Streaming control tokens (`<|ACT|>`, `<|DELAY|>`, `<|CALL|>`) continue to work correctly
- All 8 locale files are updated consistently
- Even when an LLM ignores the prompt instruction, the post-processing stripper removes Markdown syntax from speech output
- The stripper has unit tests covering all Markdown syntax types listed in R6
