# `@proj-airi/semconv-genai`

Constants for the OpenTelemetry GenAI semantic conventions. A script generates them from a pinned commit of [`open-telemetry/semantic-conventions-genai`](https://github.com/open-telemetry/semantic-conventions-genai).

The GenAI conventions moved out of the main semantic conventions repository. The new repository has no release and no npm package. The GenAI constants in `@opentelemetry/semantic-conventions` are deprecated and use the old names.

## Use it for

- GenAI attribute keys, for example `ATTR_GEN_AI_PROVIDER_NAME`.
- GenAI enum values, for example `GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN`.
- GenAI metric names, for example `METRIC_GEN_AI_CLIENT_INFERENCE_DURATION`.

## Do not use it for

- Conventions outside GenAI, for example `error.type` or HTTP attributes. Import them from `@opentelemetry/semantic-conventions`.
- AIRI metrics that the conventions do not define, for example cost and Flux. Define them in the service that records them.
- Recording logic. The package has only constants.

## Upgrade

1. Change `COMMIT` in `scripts/generate.ts`.
2. Run `pnpm -F @proj-airi/semconv-genai generate`. The script downloads the registry files, so it needs network access.
3. Read the diff of `src/generated.ts`. A removed or renamed constant breaks the typecheck of each consumer.
4. If a metric or attribute name changed, update the Grafana dashboards in `proj-airi/airi-deploy` in the same release.

Do not edit `src/generated.ts` by hand.

## Removal

Delete this package when OpenTelemetry publishes an npm package for `semantic-conventions-genai`. Then import the constants from that package.
