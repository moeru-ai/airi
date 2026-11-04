export const animations = {
  idleLoop: new URL('./idle_loop.vrma', import.meta.url),
}

/** One motion that the character can play once, for example a greeting. */
export interface VrmEmoteAnimation {
  id: string
  name: string
  /** Shown to the LLM so it can choose the emote. */
  description: string
  url: string
}

/**
 * Motions that the VRM motion library plays. The idle pool cycles, the talking clip
 * plays while speech is audible, and the emotes play once on request.
 *
 * The files come from the Utsuwa project. See `./utsuwa/NOTICE.md`.
 */
export interface VrmMotionLibrary {
  idles: string[]
  talking?: string
  /** Optional clip while the character waits for a reply. Without it, only the head reacts. */
  thinking?: string
  emotes: VrmEmoteAnimation[]
}

// NOTICE:
// Each URL is written as a literal `new URL('./file', import.meta.url)`.
// Vite copies an asset into the build only when it finds this literal pattern.
// Source: https://vite.dev/guide/assets#new-url-url-import-meta-url
// Removal condition: none while the assets ship with the package.
export const defaultVrmMotionLibrary: VrmMotionLibrary = {
  idles: [
    new URL('./utsuwa/idle-1.vrma', import.meta.url).toString(),
    new URL('./utsuwa/idle-2.vrma', import.meta.url).toString(),
    new URL('./utsuwa/idle-3.vrma', import.meta.url).toString(),
    new URL('./utsuwa/idle-4.vrma', import.meta.url).toString(),
    new URL('./utsuwa/idle-5.vrma', import.meta.url).toString(),
  ],
  talking: new URL('./utsuwa/talking.vrma', import.meta.url).toString(),
  emotes: [
    { id: 'show_full_body', name: 'Show Full Body', description: 'Step back and present the full avatar body', url: new URL('./utsuwa/emote-show-full-body.vrma', import.meta.url).toString() },
    { id: 'greeting', name: 'Greeting', description: 'Greet with a polite bowing motion', url: new URL('./utsuwa/emote-greeting.vrma', import.meta.url).toString() },
    { id: 'peace_sign', name: 'Peace Sign', description: 'Make a peace sign with the fingers', url: new URL('./utsuwa/emote-peace-sign.vrma', import.meta.url).toString() },
    { id: 'shoot', name: 'Shoot', description: 'Point finger forward like shooting', url: new URL('./utsuwa/emote-shoot.vrma', import.meta.url).toString() },
    { id: 'spin', name: 'Spin', description: 'Spin around once', url: new URL('./utsuwa/emote-spin.vrma', import.meta.url).toString() },
    { id: 'model_pose', name: 'Model Pose', description: 'Strike a confident model pose', url: new URL('./utsuwa/emote-model-pose.vrma', import.meta.url).toString() },
    { id: 'squat', name: 'Squat', description: 'Squat down briefly', url: new URL('./utsuwa/emote-squat.vrma', import.meta.url).toString() },
  ],
}
