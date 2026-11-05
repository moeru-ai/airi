# @proj-airi/evals-tts-speech-text

A [vieval](https://vieval.dev/) comparison of the text that AIRI sends to TTS. It records the text that a TTS provider cannot read as written, and the expected text for each case. The first dataset covers emoticons in Chinese, English, Japanese, and Korean.

## What the suite measures

Character replies often contain emoticons, for example `:(`, `（（（`, `QAQ`, `(╥﹏╥)`, `www`, `[捂脸]`, and 😭. A TTS provider reads them as symbols, spells them, or skips them. A good preprocessing step does three things:

- It removes the emoticon, so TTS does not read it.
- It keeps all content, including text that only looks like an emoticon, for example `f(x)`, `10:30`, and an aside in brackets.
- It gives the avatar the emotion of the emoticon, for example sad for `:(`.

For each case, a test object turns a reply into the text that TTS reads and the emotions that the avatar shows. A deterministic grader compares them with the case. The suite calls no model and no TTS provider.

| Score | Value |
| --- | --- |
| `emoticon.spoken` | 1 when TTS gets the expected text. The grader ignores whitespace, and NFKC folds the width of punctuation, so `，` equals `,` |
| `emoticon.emotion` | 1 when the avatar gets the expected emotion. `none` accepts no emotion, and `any` accepts all results |
| `emoticon.pass` (primary) | 1 when both scores are 1 |

## How to use it

Compare all test objects:

```shell
pnpm -F @proj-airi/evals-tts-speech-text eval:compare
```

The script builds `@proj-airi/core-agent` first, so the `rule` test object reads the code in your working tree.

To run one test object and keep its report, run its workspace config:

```shell
pnpm -F @proj-airi/core-agent build
cd evals/tts-speech-text
pnpm exec vieval run --config ./eval/test-objects/rule/vieval.config.ts --report-out .vieval/reports/rule
```

Each case writes `result.json` with the case and the result of the test object. `EVAL_LANGUAGES=zh,en` limits a run to some languages, and `EVAL_CASES=<id>,<id>` limits it to some cases.

To add a case, add an entry to `eval/cases/emoticon-speech/cases.ts`. Write the reply as a model writes it, the text that TTS must get, and the emotion. Add a `keep` case for each rule that can delete too much.

## Structure

```text
vieval.config.ts                  the comparison
eval/
  cases/emoticon-speech/          the dataset: 109 cases in 12 kinds
  grader/                         the deterministic grader and its unit tests
  tasks/speak/                    the shared task and the shared config
  test-objects/<object>/
    vieval.config.ts              the workspace of the test object
    src/speak-text.ts             the adapter: reply in, TTS text and emotions out
    tasks/speak/emoticon-speech/<language>.eval.ts
  index.ts                        the package entry that the test objects import
```

The test objects are:

- `raw`: the reply as the model wrote it. This is the lower reference.
- `rule`: the speech output of AIRI. The reply streams through a `VoiceController` response in small writes. The adapter records each TTS request and the emotion of each ACT token.
- `emoji-filter`: the default TTS text transforms of LiveKit Agents, `filter_markdown` then `filter_emoji`. They remove Unicode emoji blocks only. The markdown step is the AIRI one, so the comparison differs only in the emoticon step.
- `bracket-filter`: the default `tts_filter` of Open-LLM-VTuber. It deletes text in `*…*`, `[…]`, `(…)`, and `<…>`, then keeps only letters, numbers, punctuation, and whitespace.

To add a test object, add a directory under `eval/test-objects/` with a `SpeakText` adapter, a config that calls `defineSpeechTextConfig`, and one task file per language.

## Dataset

`emoticon-speech` has 109 cases: 40 in Chinese, 29 in English, 24 in Japanese, and 16 in Korean. Each case is written in one language, because each community writes its own emoticons.

| Kind | Examples |
| --- | --- |
| `face` | `:(` `:)` `>:(` `:'(` `:-)` `:)))` `:[` |
| `fullwidth-face` | `：（` `：）`, as Chinese input methods write them |
| `bracket-run` | `（（（` `）））` `((` `))` |
| `trailing-bracket` | one `（` or `）` at the end of a sentence |
| `letter-face` | `QAQ` `TAT` `orz` `XD` `ㅠㅠ` `ㅜㅜ` |
| `symbol-face` | `^_^` `>_<` `-_-` `T_T` `^^` `^^;` `ㅠ_ㅠ` |
| `kaomoji` | `(╥﹏╥)` `o(╥﹏╥)o` `(*^▽^*)` `(´・ω・`)` `(╯°□°)╯︵ ┻━┻` `¯\_(ツ)_/¯` |
| `laughter` | `2333` `hhhh` `www` `ｗｗｗ` `w` `ㅋㅋㅋ` `ㅎㅎ` |
| `sticker-code` | `[捂脸]` `[微笑]` `[吃瓜]` |
| `bracket-emote` | `（笑）` `(笑)` `（泣）` `（汗）` `【汗】` |
| `emoji` | 😭 😊 🤔 🎉 😂 😢 👍 |
| `keep` | `f(g(x))`, `1) 洗手`, `a) red`, `10:30`, `3:1`, `Note:Do`, asides in brackets, `[1]`, `[注]`, `哈哈哈`, `草`, `～`, `WWW` |

## Benchmark results

The runs of 2026-11-05 on `main`. The values are cases that pass `emoticon.spoken`, by kind.

| Kind | Cases | `raw` | `rule` | `emoji-filter` | `bracket-filter` |
| --- | --- | --- | --- | --- | --- |
| `bracket-emote` | 5 | 0 | 0 | 0 | 1 |
| `bracket-run` | 4 | 0 | 0 | 0 | 1 |
| `emoji` | 11 | 0 | 0 | 11 | 11 |
| `face` | 15 | 0 | 0 | 0 | 0 |
| `fullwidth-face` | 2 | 0 | 0 | 0 | 0 |
| `kaomoji` | 13 | 0 | 0 | 0 | 7 |
| `keep` | 27 | 27 | 27 | 27 | 15 |
| `laughter` | 7 | 0 | 0 | 0 | 0 |
| `letter-face` | 7 | 0 | 0 | 0 | 0 |
| `sticker-code` | 3 | 0 | 0 | 0 | 3 |
| `symbol-face` | 12 | 0 | 0 | 0 | 2 |
| `trailing-bracket` | 3 | 0 | 0 | 0 | 1 |

| Test object | Spoken | Emotion | Pass |
| --- | --- | --- | --- |
| `raw` | 27 | 30 | 27 |
| `rule` | 27 | 30 | 27 |
| `emoji-filter` | 38 | 30 | 28 |
| `bracket-filter` | 41 | 30 | 17 |

Every test object gets 30 emotion points from the `keep` and `any` cases, because none of them sends an emotion yet.

## Conclusion

- AIRI on `main` handles no emoticon. It sends the same text as `raw`.
- The LiveKit filter removes Unicode emoji and nothing else.
- The Open-LLM-VTuber filter removes more, but it also deletes content in 12 of the 27 `keep` cases: `f(x)` becomes `f`, an aside in brackets goes, `1)` becomes `1`, and `～` goes. It removes no face, laughter, or letter face.
- No test object handles laughter, letter faces, or ASCII faces. These are the next rules to add, case by case.

## When to use it

- Use it before and after you change how the speech output of `@proj-airi/core-agent` handles emoticons.
- Use it to check a new rule against the `keep` cases.

## When not to use it

- Do not use it to compare TTS providers. It sends nothing to TTS.
- Do not use it for formulas, money, or units. `evals/tts-speech-formula` covers them.

## Known issues

- vieval schedules a task only when a model target is registered, so each project registers a `local:deterministic` model that is never called.
- vieval loads config files with Node type stripping, which does not resolve a relative import without its extension. Thus, the test object configs import the shared config through the separate package export `@proj-airi/evals-tts-speech-text/config`.
