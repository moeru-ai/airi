---
category: Browser
---

# useMediaControls

Reactive media controls for both `audio` and `video` elements

## Usage

### Basic Usage

```vue
<script setup lang="ts">
import { useMediaControls } from '@vueuse/core'
import { onMounted, useTemplateRef } from 'vue'

const video = useTemplateRef('video')
const { playing, currentTime, duration, volume } = useMediaControls(video, {
  src: 'video.mp4',
})

// Change initial media properties
onMounted(() => {
  volume.value = 0.5
  currentTime.value = 60
})
</script>

<template>
  <video ref="video" />
  <button @click="playing = !playing">
    Play / Pause
  </button>
  <span>{{ currentTime }} / {{ duration }}</span>
</template>
```

### Providing Captions, Subtitles, etc...

You can provide captions, subtitles, etc in the `tracks` options of the
`useMediaControls` function. The function will return an array of tracks
along with two functions for controlling them, `enableTrack`, `disableTrack`, and `selectedTrack`.
Using these you can manage the currently selected track. `selectedTrack` will
be `-1` if there is no selected track.

```vue
<script setup lang="ts">
import { useMediaControls } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const video = useTemplateRef('video')
const {
  tracks,
  enableTrack
} = useMediaControls(video, {
  src: 'video.mp4',
  tracks: [
    {
      default: true,
      src: './subtitles.vtt',
      kind: 'subtitles',
      label: 'English',
      srcLang: 'en',
    },
  ]
})
</script>

<template>
  <video ref="video" />
  <button v-for="track in tracks" :key="track.id" @click="enableTrack(track)">
    {{ track.label }}
  </button>
</template>
```

## Type Declarations

```ts
/**
 * Many of the jsdoc definitions here are modified version of the
 * documentation from MDN(https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement)
 */
export interface UseMediaSource {
  /**
   * The source url for the media
   */
  src: string
  /**
   * The media codec type
   */
  type?: string
  /**
   * Specifies the media query for the resource's intended media.
   */
  media?: string
}
export interface UseMediaTextTrackSource {
  /**
   * Indicates that the track should be enabled unless the user's preferences indicate
   * that another track is more appropriate
   */
  default?: boolean
  /**
   * How the text track is meant to be used. If omitted the default kind is subtitles.
   */
  kind: TextTrackKind
  /**
   * A user-readable title of the text track which is used by the browser
   * when listing available text tracks.
   */
  label: string
  /**
   * Address of the track (.vtt file). Must be a valid URL. This attribute
   * must be specified and its URL value must have the same origin as the document
   */
  src: string
  /**
   * Language of the track text data. It must be a valid BCP 47 language tag.
   * If the kind attribute is set to subtitles, then srclang must be defined.
   */
  srcLang: string
}
interface UseMediaControlsOptions extends ConfigurableDocument {
  /**
   * The source for the media, may either be a string, a `UseMediaSource` object, or a list
   * of `UseMediaSource` objects.
   */
  src?: MaybeRefOrGetter<string | UseMediaSource | UseMediaSource[]>
  /**
   * A list of text tracks for the media
   */
  tracks?: MaybeRefOrGetter<UseMediaTextTrackSource[]>
}
export interface UseMediaTextTrack {
  /**
   * The index of the text track
   */
  id: number
  /**
   * The text track label
   */
  label: string
  /**
   * Language of the track text data. It must be a valid BCP 47 language tag.
   * If the kind attribute is set to subtitles, then srclang must be defined.
   */
  language: string
  /**
   * Specifies the display mode of the text track, either `disabled`,
   * `hidden`, or `showing`
   */
  mode: TextTrackMode
  /**
   * How the text track is meant to be used. If omitted the default kind is subtitles.
   */
  kind: TextTrackKind
  /**
   * Indicates the track's in-band metadata track dispatch type.
   */
  inBandMetadataTrackDispatchType: string
  /**
   * A list of text track cues
   */
  cues: TextTrackCueList | null
  /**
   * A list of active text track cues
   */
  activeCues: TextTrackCueList | null
}
export interface UseMediaControlsReturn {
  currentTime: ShallowRef<number>
  duration: ShallowRef<number>
  waiting: ShallowRef<boolean>
  seeking: ShallowRef<boolean>
  ended: ShallowRef<boolean>
  stalled: ShallowRef<boolean>
  buffered: Ref<[number, number][]>
  playing: ShallowRef<boolean>
  rate: ShallowRef<number>
  volume: ShallowRef<number>
  muted: ShallowRef<boolean>
  tracks: Ref<UseMediaTextTrack[]>
  selectedTrack: ShallowRef<number>
  enableTrack: (
    track: number | UseMediaTextTrack,
    disableTracks?: boolean,
  ) => void
  disableTrack: (track?: number | UseMediaTextTrack) => void
  supportsPictureInPicture: boolean
  togglePictureInPicture: () => Promise<PictureInPictureWindow | void>
  isPictureInPicture: ShallowRef<boolean>
  onSourceError: EventHookOn<Event>
  onPlaybackError: EventHookOn<Event>
}
export declare function useMediaControls(
  target: MaybeRef<HTMLMediaElement | null | undefined>,
  options?: UseMediaControlsOptions,
): UseMediaControlsReturn
```
