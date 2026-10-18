import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import type { ComputerUseCommandReader } from './view'

import { boolean, looseObject, safeParse, string } from 'valibot'

import { MediaStateSchema } from './schemas'

/** The player of now playing shows the track, its progress, the play state and speed, the source app, and the like. */
const PLAYER_SHOWN = {
  present: true,
  is_playing: true,
  playback_rate: true,
  title: true,
  artist: true,
  album: true,
  source_bundle_id: true,
  duration_seconds: true,
  elapsed_seconds: true,
  is_liked: true,
} satisfies ToolResultCoverage

/** The before and after states of a media command show only the track and the play state. */
const COMPACT_SHOWN = { present: true, is_playing: true, title: true, artist: true, album: true } satisfies ToolResultCoverage

/** `schema_version` names the shape of the record, not a property of the media. */
const SCHEMA_VERSION_OMITTED = { schema_version: true } satisfies ToolResultCoverage

const readMediaControl: ComputerUseCommandReader = (result) => {
  const parsed = safeParse(looseObject({ command: string(), verified: boolean(), before: MediaStateSchema, after: MediaStateSchema }), result)
  if (!parsed.success)
    return undefined
  const { command, verified, before, after } = parsed.output
  return {
    view: { kind: 'media', command, verified, before, after },
    shown: { result: { command: true, verified: true, before: COMPACT_SHOWN, after: COMPACT_SHOWN } },
    omitted: { result: { before: SCHEMA_VERSION_OMITTED, after: SCHEMA_VERSION_OMITTED } },
  }
}

/** Now playing and the media controls. */
export const mediaReaders: Record<string, ComputerUseCommandReader> = {
  'mediaControl.nowPlaying': (result) => {
    const parsed = safeParse(MediaStateSchema, result)
    if (!parsed.success)
      return undefined
    return { view: { kind: 'now-playing', state: parsed.output }, shown: { result: PLAYER_SHOWN }, omitted: { result: SCHEMA_VERSION_OMITTED } }
  },
  'mediaControl.play': readMediaControl,
  'mediaControl.pause': readMediaControl,
  'mediaControl.togglePlayPause': readMediaControl,
  'mediaControl.next': readMediaControl,
  'mediaControl.previous': readMediaControl,
}
