import type { AudioFrame, Room, VideoFrame } from '@livekit/rtc-node'

import { AudioSource, AudioStream, LocalAudioTrack, RoomEvent, TrackPublishOptions, VideoStream } from '@livekit/rtc-node'
import { createLiveKitLogger } from '@proj-airi/visual-chat-observability'
import { AUDIO_SAMPLE_RATE, LIVEKIT_TEXT_STREAM_TOPIC, TTS_OUTPUT_SAMPLE_RATE } from '@proj-airi/visual-chat-protocol'

const log = createLiveKitLogger()

export type AudioFrameHandler = (frame: AudioFrame, participantIdentity: string, trackSid: string) => void
export type VideoFrameHandler = (frame: VideoFrame, participantIdentity: string, trackSid: string) => void
export type TextStreamHandler = (text: string, participantIdentity: string, topic: string) => void

export function subscribeAudioTracks(room: Room, handler: AudioFrameHandler): void {
  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind !== 'audio')
      return

    const stream = new AudioStream(track, AUDIO_SAMPLE_RATE, 1)
    const trackSid = track.sid!
    const identity = participant.identity

    void (async () => {
      for await (const event of stream) {
        handler(event.frame, identity, trackSid)
      }
    })()

    log.withTag('tracks').log(`Audio track subscribed: ${trackSid} from ${identity}`)
  })
}

export function subscribeVideoTracks(room: Room, handler: VideoFrameHandler): void {
  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind !== 'video')
      return

    const stream = new VideoStream(track)
    const trackSid = track.sid!
    const identity = participant.identity

    void (async () => {
      for await (const event of stream) {
        handler(event.frame, identity, trackSid)
      }
    })()

    log.withTag('tracks').log(`Video track subscribed: ${trackSid} from ${identity}`)
  })
}

export async function publishAudioSource(room: Room, sampleRate: number = TTS_OUTPUT_SAMPLE_RATE): Promise<AudioSource> {
  const source = new AudioSource(sampleRate, 1)
  const track = LocalAudioTrack.createAudioTrack('airi-tts', source)

  await room.localParticipant.publishTrack(track, new TrackPublishOptions())
  log.withTag('tracks').log('Published TTS audio track')

  return source
}

export function subscribeTextStream(room: Room, handler: TextStreamHandler): void {
  room.registerTextStreamHandler(LIVEKIT_TEXT_STREAM_TOPIC, (reader, participantIdentity) => {
    void (async () => {
      try {
        const chunks: string[] = []
        for await (const chunk of reader) {
          chunks.push(chunk)
        }
        const fullText = chunks.join('')
        handler(fullText, participantIdentity, LIVEKIT_TEXT_STREAM_TOPIC)
      }
      catch (err) {
        log.withTag('tracks').warn(`Text stream read error: ${err}`)
      }
    })()
  })
  log.withTag('tracks').log(`Text stream handler registered for topic: ${LIVEKIT_TEXT_STREAM_TOPIC}`)
}

export async function sendTextStream(room: Room, destinationIdentities: string[], text: string): Promise<void> {
  await room.localParticipant.sendText(text, {
    topic: LIVEKIT_TEXT_STREAM_TOPIC,
    destinationIdentities,
  })
}
