# Generation request schemas

This server-owned layer validates native model API requests. Routes reuse it before applying account and product policy.
The Responses schema accepts portable content and provider references. The hosted route rejects provider references because upstream credentials are shared.
Do not put account restrictions in these protocol schemas. Do not import this server layer into client providers.
Future protocols add their own schema module here rather than extending the Responses contract.

`openresponses-schema.ts` is generated from the request-reachable OpenResponses OpenAPI schemas retrieved on 2026-09-16.
`request-openapi.json` stores the normalized input. Discriminators are removed, following xsai's generation configuration.
Inline array-item unions are lifted to named schemas because openapi-ts 0.99.0 otherwise emits unknown items.
Generate with openapi-ts 0.99.0 and TypeScript 6.0.3:

```sh
openapi-ts -i request-openapi.json -o generated -p @hey-api/typescript valibot
```

Replace `openresponses-schema.ts` with `generated/valibot.gen.ts`, then run the Responses request tests.
`responses.ts` adds OpenAI search and replay fields. Keep these extensions separate from generated output.
Only TypeScript sources and the generation input are stored here; the application build produces JavaScript.
This is the supported request subset, not a validator for all hosted tools.

References: https://www.openresponses.org/openapi/openapi.json and https://platform.openai.com/docs/api-reference/responses/create.
