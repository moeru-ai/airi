// The package entry for test objects.
//
// WORKAROUND:
// `./config`, `./speech-models`, and `./gemini-transcription` are separate package exports, so that a vieval config can import them.
// vieval 0.4.0 loads configs with Node type stripping, which does not resolve a relative import without its extension,
// and this file re-exports such imports. The repository lint rule forbids the `.ts` extension in relative imports.
// Source: `Cannot find module .../src/method-config` when a test object config imported this module.
// Remove when vieval loads configs through a resolver that adds extensions, for example jiti or Vite.
export * from './cases/formula-speech'
export * from './evaluators/grader'
export * from './evaluators/listener'
export * from './evaluators/speech'
export * from './shared/cache-key'
export * from './shared/telemetry'
export * from './shared/velin'
export * from './tasks/read-aloud'
