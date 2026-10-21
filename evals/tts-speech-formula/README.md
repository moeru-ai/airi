# @proj-airi/evals-tts-speech-formula

A [vieval](https://vieval.dev/) comparison that measures how well a listener understands the formulas that AIRI reads aloud. It covers LaTeX math, chemistry, units, and dollar amounts in Chinese, English, Japanese, and Korean.

For each case, a test object turns a reply into spoken text. The text optionally goes through TTS and ASR. Then a listener model writes down what it heard as LaTeX, and a deterministic grader compares that answer with the reference. The listener model never grades.

## What the suite measures

AIRI reads a reply aloud to a person. The person must understand what the formula says, as from a teacher. The person
does not write it down. So the goal of a reading is that it keeps the meaning and sounds natural:

- A reading that changes the meaning is wrong, for example `v - (x - \epsilon)` read as "v minus x minus epsilon".
- A reading that spells markup is wrong, for example "open parenthesis x close parenthesis" for `f(x)`.
- A reading does not need to name every detail that a dictation needs. A lone `\Sigma` can be "sigma", and a compound
  subscript does not need an end word.

The listener and the grader measure whether the meaning survives. They are a proxy: a listener model writes LaTeX, so
`formula.correct` also rewards words that only help a dictation. Read `formula.correct` as the floor of meaning, and
`formula.natural` as the reading that a person wants to hear. A Chinese, Japanese, or Korean equation reads its
substances without coefficients, as a textbook does, so `formula.correct` is 0 for it although the listener heard it.

A judge model also reads the spoken text. It checks that the text says the meaning of the formula instead of spelling its markup. A listener model can write down "open parenthesis x close parenthesis" as easily as "of x", so correctness alone rewards spelled readings.

```text
markdown -> test object -> spoken text -> [TTS -> ASR] -> listener model (3 votes) -> LaTeX -> grader -> formula.correct: 1 or 0
                                       \-> judge model (3 votes) -> natural, mixed, or spelled -> formula.natural: 1, 0.5, or 0
```

The task records two named scores, and vieval derives the headline score from them:

| Score | Grader | Value |
| --- | --- | --- |
| `formula.correct` | listener votes and the grader | 1 when a strict majority writes the formula back correctly |
| `formula.natural` | judge votes | 1 for natural, 0.5 for mixed, 0 for spelled, the median |
| `formula.pass` (primary) | derived | 1 when the reading is correct and at least mixed |

Compare `formula.correct` for correctness and `formula.pass` for correct readings that a person wants to hear. Reports of vieval 0.9 and older cannot be read, so run them again.

## How to use it

1. Copy `.env.example` to `.env` and set the endpoints and keys. The file holds nothing else.
2. Set the matrix in `eval/tasks/read-aloud/config.ts`: the `tts`, `asr`, and `listener` axes, the TTS models and their voices, and the languages.
3. Compare all test objects:

```shell
pnpm -F @proj-airi/evals-tts-speech-formula eval:compare
```

The script builds `@proj-airi/core-agent` first, so the `rule` test object reads the code in your working tree. It writes the comparison to `.vieval/comparison.json`.

To run one test object and keep its full report, run its workspace config:

```shell
pnpm -F @proj-airi/core-agent build
cd evals/tts-speech-formula
pnpm exec vieval run --config ./eval/test-objects/rule/vieval.config.ts --report-out .vieval/reports/rule
```

Each case writes `spoken.txt` and `result.json` as artifacts. A case with a TTS provider also writes `speech.mp3`. To compare two retained reports case by case, use `vieval report compare <left> <right>`. Cases match by `benchmark.case.id`, which is `<case>|<language>|<tts>` and leaves the test object out.

To add a TTS provider, add a `speechProviderFrom` and a `speechModelFrom` entry to `modelPlugins` in `eval/tasks/read-aloud/config.ts`, add the model id to the `tts` axis, and set the provider env in `.env`. Every provider takes the same OpenAI-compatible `/audio/speech` request. Thus, the official AIRI provider, unspeech, and other services differ only in their endpoint, model, and voices. Set `sendsLanguage: true` on a model whose endpoint takes the language of the text in `extra_body.language`, as the official AIRI provider does. The clip then gets the BCP 47 tag of the case language, for example `en-US`, and the tag is part of its cache key.

## Structure

```text
vieval.config.ts                  the comparison
eval/
  cases/formula-speech/           the dataset: 70 cases and the four languages
  evaluators/
    speech/                       TTS and ASR. `speech-models.ts` is a vieval plugin, see below
    listener/                     the listener model: Velin prompt, votes, and cached answers
    judge/                        the judge model: Velin prompt, votes, and cached verdicts of the reading style
    grader/                       the deterministic grader and its unit tests
  tasks/read-aloud/               the shared task that runs one test object through the evaluators, and the shared config
  shared/                         environment variables, cache keys, and Velin rendering
  test-objects/<object>/
    vieval.config.ts              the workspace of the test object
    src/read-aloud.ts             the adapter: reply in, spoken text out
    tasks/read-aloud/formula-speech/<language>.eval.ts
  index.ts                        the package entry that the test objects import
```

| Vieval layer | In this suite |
| --- | --- |
| Comparison | `vieval.config.ts`, on the `formula-speech` dataset. |
| Workspace | One test object under `eval/test-objects/`: `raw`, `rule`, `llm`, or `sre`. |
| Project | One per test object, named `formula-speech-<object>`. |
| Run matrix | `tts`: `none`, then TTS model ids. The `llm` object adds `rewrite`, its rewrite model. |
| Eval matrix | `listener`, the listener model, `judge`, the judge model, and `asr`, the ASR model when `tts` has a provider. They are part of the measurement, not of the test object. |
| Task | `read-aloud` in one language. During development, `EVAL_LANGUAGES=<language>,<language>` limits a run to some languages. |
| Case | One of the 70 cases. During development, `EVAL_CASES=<id>,<id>` limits a run to some cases. |

The test objects are:

- `raw`: the markdown as the model wrote it. This is AIRI without formula speech.
- `rule`: `toSpeechText` of `@proj-airi/core-agent`, the rule engine that AIRI ships.
- `llm`: a model rewrites the reply for speech. It is a reference for the upper bound. It is too slow for the live path. Its rewrite prompt is in its own `src/`.
- `sre`: speech-rule-engine ClearSpeak. It has no Chinese or Japanese locale, so those languages get the English reading.

The prompts are [Velin](https://github.com/moeru-ai/velin) markdown. Keep each LaTeX example of a prompt in a code span: Velin escapes backslashes and underscores in plain text.

To add a test object, add a directory under `eval/test-objects/` with a `ReadAloud` adapter, a config that calls `defineFormulaSpeechConfig`, and one task file per language. The comparison finds it automatically.

`tts: none` sends the spoken text straight to the listener. It measures only what AIRI hands to TTS, independent of the provider. This is the floor that AIRI controls. A real provider shows which parts of that text the provider then reads wrong.

## ASR

The `asr` axis selects the speech recognizer of every TTS clip. Two are registered:

- `apple-speech`: Apple Speech on macOS, through `@xsai-apple-speech/transcription-native`. It runs locally and needs no key. It uses one recognizer per language: `zh-CN`, `en-US`, `ja-JP`, or `ko-KR`. Install these locales in the macOS speech settings. It is the default, because `whisper-1` fell into repetition loops on short clips.
- `whisper-1`: any OpenAI-compatible `/audio/transcriptions` endpoint, set with `ASR_BASE_URL` and `ASR_API_KEY`.
- `gemini-3.8-flash`: Gemini through its `generateContent` API, set with `ASR_GEMINI_BASE_URL` and `ASR_GEMINI_API_KEY`. The base URL is the Gemini API root, for example `https://generativelanguage.googleapis.com/v1beta/`. Gemini has no `/audio/transcriptions` endpoint, so `evaluators/speech/gemini-transcription.ts` is a transcription executor that sends the clip as inline audio.

Put several in the `asr` axis to compare them on the same clips. `EVAL_ASR=apple-speech,gemini-3.8-flash` selects them for one run.

## Speech models plugin

`eval/evaluators/speech/speech-models.ts` registers TTS and ASR models the way `vieval/plugins/chat-models` registers chat models. It uses only the public vieval API, so it can move into vieval as `vieval/plugins/speech-models`.

| Chat models | Speech models |
| --- | --- |
| `ChatProviders`, `chatProviderFrom` | `SpeechProviders`, `speechProviderFrom` |
| `ChatModels`, `chatModelFrom` | `SpeechModels`, `speechModelFrom`, `transcriptionModelFrom` |
| `modelFromRun`, `modelFromEval` | `speechModelFromRun`, `speechModelFromEval`, `transcriptionModelFromRun`, `transcriptionModelFromEval` |
| `openaiFromRunContext` | `openaiSpeechFromRunContext`, `openaiTranscriptionFromRunContext`, `voiceFor` |

The plugins register every declared model, and the matrix only selects them by id, as with chat models. The models go into the shared `config.models` registry. Provider endpoints and keys are optional at load time, so an unused provider needs no env. A selected model without its base URL fails when the task resolves it, and the error names its provider. `parameters.capability` is `speech` or `transcription`, and a lookup rejects a model with the wrong capability. A TTS model has a default `voice` and a `voices` map by language. A transcription provider can also be a `TranscriptionExecutor`: an object that returns xsai request options with its own `fetch` for each call, for example a native recognizer. Like the chat plugin, it does not send requests. The suite sends them with `@xsai/generate-speech` and `@xsai/generate-transcription`.

## Grading

| Mode | A case passes when |
| --- | --- |
| `symbolic` | The answer is equal after normalization, or symbolically equivalent with [Compute Engine](https://cortexjs.io/compute-engine/). `6/π²` does not pass for `π²/6`. Limits, sums, and integrals must match operator by operator. |
| `norm` | The answer is equal after normalization. |
| `chem` | The answer has the same species, coefficients, and arrow class. The order of terms is free. |
| `currency` | The answer has the same dollar amounts and the same inline math. |

Speech cannot carry letter case, so the grader folds letter case. When the reference uses both cases of one letter, for example `a \in A`, the grader keeps case.

Each case gets three listener answers. The case passes with a strict majority.

Each answer also has a hearing status: `ok`, `partial`, or `unclear`. The listener sets it through structured output. An `unclear` vote scores 0 with the grading rule `unclear`, so a report tells an unintelligible clip apart from a wrong reading. The `tts_speech_formula.hearing` metric is the status of most votes.

Each case also gets three judge verdicts on the spoken text: `natural`, `mixed`, or `spelled`. The judge never sees the answer of the listener and never judges correctness. The case takes the median verdict as the `tts_speech_formula.reading` metric, and records its score as `formula.natural`. The judge reads the spoken text, not the ASR transcript, so ASR errors do not count against the test object.

### Judge calibration

A person labels a fixed set of readings, and the share of labels that the judge matches measures the judge. The set is
`eval/evaluators/judge/calibration/calibration.json`: 15 readings for each language, spread over the test objects and
the verdicts of the judge.

1. After a change of the judge prompt, run the eval on the cases of the set, then refresh the verdicts with
   `pnpm -F @proj-airi/evals-tts-speech-formula run judge:collect`. It keeps the set and prints how many labels the
   judge matches. `-- --pick` picks a new set and keeps the labeled readings.
2. To label a reading, set its `label` in `calibration.json` to `natural`, `mixed`, or `spelled`. `note` says why.

On 2026-10-20 the judge matched 31 of 43 labels (72%). After the prompt took the labels into account, it matched 34 (79%).
On 2026-10-21, after the eval review changed the prompt and the readings, it matched 32 (74%). Three labeled readings
have new words since, so they keep an older verdict.

The `tts_speech_formula.leftover_notation` metric counts the symbols and LaTeX command names that a test object left in its spoken text, for example `^`, `/`, `$`, or `mapsto`. It needs no TTS. The test `eval/test-objects/rule/src/read-aloud.test.ts` lists these leftovers of the rule engine for every case, without any model call.

The test `eval/test-objects/rule/src/structure.test.ts` compares the MathJSON of the rule engine (`MathSpeech.toMathJson` of `@proj-airi/speech-transformer-math`) with Compute Engine on the standard heads, for example `Divide`, `Limit`, `D`, and `Interval`. Its snapshot lists each formula where the two trees differ. It also runs without any model call.

Answers are cached by model, prompt, transcript, and vote number. Thus, an unchanged transcript gets the same answer in every run, and run-to-run changes come only from the test object.

## History

The suite was first written in Python for Goal task T-157, with a sympy grader. The cached answers of the two full T-157 runs were graded again with this grader. It agrees with the sympy grader on 99.88% (edge-tts) and 99.94% (official StepFun) of the 3216 votes of each run. The remaining differences are these:

- `\sum (1/2)^k` against `\sum 1/2^k`: Compute Engine does not prove that the two summands are equal, so this grader fails the answer.
- An answer with a trailing `?`: sympy cannot parse it, but Compute Engine ignores the character.

The prompts were also rewritten as structured Velin markdown. The scores are therefore not comparable with the T-157 baseline. Use a new baseline from this suite.

## Usage

The suite records what each run spends. It records only calls that reach a provider: a cached answer makes no call, so a rerun records almost nothing.

| Call | Record | Where |
| --- | --- | --- |
| Listener, judge, and `llm` rewrite | Token usage and latency, as vieval `inference.*` events | The inference panel of each case in the viewer, and `events.jsonl` |
| TTS | `tts_speech_formula.tts.characters_sent` | Case metrics |
| ASR | `tts_speech_formula.asr.requests` | Case metrics |

TTS and ASR use metrics because the vieval inference events accept only chat calls. The suite records no prices.

## When to use it

- Use it before and after you change `math-speech` or `toSpeechText` in `@proj-airi/core-agent`.
- Use it to compare TTS providers on the same spoken text.

## When not to use it

- Do not use it as a unit test. It calls paid models. The unit tests of the rule engine are in `packages/core-agent`.
- Do not use its score as a measure of human understanding. The listener is a model that reads an ASR transcript, not a person who hears audio.

## Known issues

- In vieval 0.4.0, two `describeTask` calls in one eval file get the same task id, and the second task overwrites the cases of the first. Thus, each language has its own task file.
- `vieval compare` writes the report of each test object to a temporary directory. To keep the cases and artifacts of one test object, run its workspace config with `--report-out`.
- Vieval loads config files with Node type stripping, which does not resolve a relative import without its extension. Thus, the test object configs import the shared config through the separate package export `@proj-airi/evals-tts-speech-formula/config`.
