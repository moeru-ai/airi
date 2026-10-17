# @proj-airi/memory-eval

Identity-continuity evaluation for long-horizon character memory.

## What it does

It checks whether a character stays the same character after long conversations
and memory compression. It answers one question:

> Is this still the same character?

It provides four metrics:

- **Fixed-point probe.** Ask "who are you?" repeatedly. A stable self-description
  converges to one answer. A drifting self-description moves or collapses to a
  generic "I am an AI assistant" reply.
- **Barycenter migration.** Score answers on four axes: identity, value,
  expression, memory. Track the center of the score cloud with a Wasserstein-1
  distance. A moved center means drift.
- **Bimodality.** Fit a 1-component and a 2-component Gaussian mixture and
  compare BIC. A clear two-component fit means the answers split into two
  conflicting personas.
- **Human calibration.** Cohen kappa measures how well the automatic judge
  agrees with human labels. This guards the coordinate system itself.

The package has zero runtime dependencies. The W1 distance, the GMM EM
algorithm, and Cohen kappa are all implemented in this package.

## When to use it

- Compare memory strategies before you ship one (retention window, summary
  threshold, hybrid retrieval).
- Add a regression test that fails when a change degrades identity.
- Tell "forgot one fact" apart from "became a different character".

## When not to use it

- Single-turn chat. Identity continuity needs multi-session context.
- Coding agents. They are productivity tools, not created personas.
- A persona with no defined identity. An undefined identity has no defined drift.

## Quick start

The judge and the model are functions you provide. The package does not bind to
one model provider.

```typescript
import {
  identityContinuityHarness,
  createJudge,
  createMockJudge,
} from '@proj-airi/memory-eval'

// Wire `chat` to any provider. It takes a prompt and returns the model text.
const chat = async (prompt: string): Promise<string> => {
  // ...call your provider and return the text answer...
  return prompt
}

const judge = createJudge({
  persona: 'A quantum physicist who loves Feynman quotes',
  chat,
})

const result = await identityContinuityHarness({
  character: {
    name: 'Dr. Lin',
    persona: 'A quantum physicist who loves Feynman quotes',
  },
  // infer: produce one character answer from a prompt
  infer: chat,
  judge,
  probePrompts: [
    'Who are you?',
    'What matters most to you?',
    'How would you explain quantum entanglement?',
  ],
  sessions: 5,
  messagesPerSession: 20,
})

console.log(result.driftScore.drifted) // boolean
console.log(result.driftScore.driftScore) // 0..1, higher means more drift
console.log(result.w1Distance)
console.log(result.fpDistance)
```

For tests and offline work, use the deterministic mock judge:

```typescript
const judge = createMockJudge({ stable: true, seed: 42 })
```

You can also call the metrics directly without the harness:

```typescript
import { wassersteinDistance, detectBimodality, cohensKappa } from '@proj-airi/memory-eval'

const w1 = wassersteinDistance(baselineScores, currentScores) // 0 = identical
const split = detectBimodality(scoreVectors) // split.bimodal, split.bicImprovement
const k = cohensKappa(humanLabels, judgeLabels) // k.kappa, k.valid
```

## Metrics and thresholds

| Metric | Drift signal | Default threshold |
| --- | --- | --- |
| Fixed point | residual does not converge, or the fixed point moves | 0.15 |
| W1 barycenter | center of the score cloud moves | 0.3 |
| Bimodality | BIC(k=2) beats BIC(k=1) | BIC gain 10 |
| Human kappa | judge disagrees with humans | kappa at least 0.4 |

Thresholds are inputs, not constants. Calibrate them for your persona.

## Evidence

An offline prototype applied these metrics to the modelled memory strategies of
three real companion projects: full history (no compression), rolling AI
summary, and retention plus hybrid retrieval. Result: no drift for the
no-compression baseline, and drift for both compressing strategies, with hybrid
retrieval preserving more identity than an aggressive word-budget summary. This
shows the metrics are substrate-independent; they do not depend on one project.

A human-calibration study on 50 samples gave Cohen kappa 0.62 against a validity
threshold of 0.4.

Design notes: [ADR 2026-10-17 identity-continuity evaluation](../../../docs/ai/adr/2026-10-17-identity-continuity-evaluation.md).

## Contributing

Follow the [AIRI contribution guidelines](../../../.github/CONTRIBUTING.md).

- Conventional Commits, for example `feat(memory-eval): add bimodality test`
- No `any` type
- File names in kebab-case
- Docs in simple english
- Run `pnpm --filter @proj-airi/memory-eval exec tsc --noEmit` and
  `pnpm --filter @proj-airi/memory-eval exec vitest run`

## License

MIT
