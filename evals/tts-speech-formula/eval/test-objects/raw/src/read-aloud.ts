import type { ReadAloud } from '@proj-airi/evals-tts-speech-formula'

/** The markdown as the model wrote it. This is AIRI without formula speech, the lower reference. */
export const readAloud: ReadAloud = async markdown => markdown
