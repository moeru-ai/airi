// The package entry for test objects.
//
// NOTICE:
// `./config` is a separate package export, so that a vieval config can import it.
// vieval loads configs with Node type stripping, which does not resolve a relative import without its extension,
// and this file re-exports such imports. The repository lint rule forbids the `.ts` extension in relative imports.
// Source: the same workaround in evals/tts-speech-formula/eval/index.ts.
// Remove when vieval loads configs through a resolver that adds extensions, for example jiti or Vite.
export * from './cases/emoticon-speech'
export * from './cases/languages'
export * from './grader'
export * from './tasks/speak'
