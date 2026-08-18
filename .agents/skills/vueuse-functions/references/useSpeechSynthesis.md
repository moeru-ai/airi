---
category: Sensors
---

# useSpeechSynthesis

Reactive [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

> [Can I use?](https://caniuse.com/mdn-api_speechsynthesis)

## Usage

```ts
import { useSpeechSynthesis } from '@vueuse/core'

const {
  isSupported,
  isPlaying,
  status,
  voiceInfo,
  utterance,
  error,
  stop,
  toggle,
  speak,
} = useSpeechSynthesis()
```

### Options

The following shows the default values of the options, they will be directly passed to [SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

```ts
import { useSpeechSynthesis } from '@vueuse/core'
// ---cut---
useSpeechSynthesis({
  lang: 'en-US',
  pitch: 1,
  rate: 1,
  volume: 1,
})
```

## Type Declarations

```ts
export type UseSpeechSynthesisStatus = "init" | "play" | "pause" | "end"
export interface UseSpeechSynthesisOptions extends ConfigurableWindow {
  /**
   * Language for SpeechSynthesis
   *
   * @default 'en-US'
   */
  lang?: MaybeRefOrGetter<string>
  /**
   * Gets and sets the pitch at which the utterance will be spoken at.
   *
   * @default 1
   */
  pitch?: MaybeRefOrGetter<SpeechSynthesisUtterance["pitch"]>
  /**
   * Gets and sets the speed at which the utterance will be spoken at.
   *
   * @default 1
   */
  rate?: MaybeRefOrGetter<SpeechSynthesisUtterance["rate"]>
  /**
   * Gets and sets the voice that will be used to speak the utterance.
   */
  voice?: MaybeRef<SpeechSynthesisVoice>
  /**
   * Gets and sets the volume that the utterance will be spoken at.
   *
   * @default 1
   */
  volume?: MaybeRefOrGetter<SpeechSynthesisUtterance["volume"]>
  /**
   * Callback function that is called when the boundary event is triggered.
   */
  onBoundary?: (event: SpeechSynthesisEvent) => void
}
export interface UseSpeechSynthesisReturn extends Supportable {
  isPlaying: ShallowRef<boolean>
  status: ShallowRef<UseSpeechSynthesisStatus>
  utterance: ComputedRef<SpeechSynthesisUtterance>
  error: ShallowRef<SpeechSynthesisErrorEvent | undefined>
  stop: () => void
  toggle: (value?: boolean) => void
  speak: () => void
}
/**
 * Reactive SpeechSynthesis.
 *
 * @see https://vueuse.org/useSpeechSynthesis
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis SpeechSynthesis
 */
export declare function useSpeechSynthesis(
  text: MaybeRefOrGetter<string>,
  options?: UseSpeechSynthesisOptions,
): UseSpeechSynthesisReturn
```
