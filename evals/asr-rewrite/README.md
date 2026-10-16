# @proj-airi/evals-asr-rewrite

A [vieval](https://vieval.dev/) suite for the voice transcription rephrase agent in `@proj-airi/agents`. The agent rewrites speech recognition text before AIRI submits it.

## How to use it

1. Copy `.env.example` to `.env.test` and set `OPENROUTER_API_KEY`.
2. Set `ASR_REWRITE_MODELS` to the OpenRouter models to compare, separated by commas.
3. Run the suite:

```shell
pnpm -F @proj-airi/evals-asr-rewrite eval:run
```

4. To keep the rewritten text of each case, add `--report-out <directory>`. Each case writes `rephrase.json` as an artifact.

## Layout

| Path | Content |
| --- | --- |
| `src/cases.ts` | The input cases. Each case is the segment list of one spoken message. |
| `src/provider.ts` | Adapts the model that vieval selected to the provider interface of core-agent. |
| `evals/*.eval.ts` | The tasks. Each case runs once for each model in `ASR_REWRITE_MODELS`. |

## When to use it

- Use it before you change the rephrase prompt or the default rephrase model.
- Use it to compare models for the hearing rephrase setting.

## When not to use it

- Do not use it as a unit test. It calls paid models. The unit tests are in `packages/agents`.
